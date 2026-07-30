import type { Context } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import { type Conversation } from "@grammyjs/conversations";
import type { Env } from "../../config/env";
import { ConversationStateManager } from "../../services/ConversationStateManager";
import { SubmissionFlowService } from "../../services/SubmissionFlowService";
import { SubmissionService } from "../../services/SubmissionService";
import {
  buildCategorySelectionKeyboard,
  buildSubmissionTypeKeyboard,
  buildUploadKeyboard,
  SUBMISSION_CB,
} from "../keyboards/submissionKeyboard";
import { buildMainMenuKeyboard, MENU_BUTTONS } from "../keyboards/mainMenuKeyboard";
import { getSubmissionMaxFileSize, validateSubmissionFile } from "../validation/fileValidation";
import { downloadAndParseExcel } from "../../lib/excel/parseSubmissionFile";
import { ValidationError } from "../../core/errors/AppError";
import type { PrimeEarnContext } from "../types";
import { logger } from "../../core/logger";

type SubmissionConversation = Conversation<PrimeEarnContext, Context>;

/**
 * Returns true when the incoming update should immediately exit the
 * submission conversation: any Main Menu button, /start, or /cancel.
 */
function isEscapeUpdate(ctx: Context): boolean {
  const text = ctx.message?.text ?? "";
  const menuTexts = Object.values(MENU_BUTTONS) as string[];
  return (
    text.startsWith("/start") ||
    text === "/cancel" ||
    menuTexts.includes(text) ||
    ctx.callbackQuery?.data === SUBMISSION_CB.CANCEL
  );
}

export function createSubmissionConversation(app: FirebaseApp, env: Env) {
  const flowService = new SubmissionFlowService(app);
  const stateManager = new ConversationStateManager(app);
  const submissionService = new SubmissionService(app);
  const maxFileSize = getSubmissionMaxFileSize(env.SUBMISSION_MAX_FILE_SIZE_BYTES);

  return async function submissionConversation(
    conversation: SubmissionConversation,
    ctx: Context,
  ): Promise<void> {
    if (!ctx.from || !ctx.chatId) return;

    const telegramId = ctx.from.id;
    const chatId = ctx.chatId;

    // Clears our custom Firestore submission draft state.
    // grammY automatically removes its own conversation_states when the
    // conversation function returns, so we only need to clean our side.
    const clearState = () =>
      conversation.external(() =>
        stateManager.getStorage().deleteSubmissionFlow(chatId),
      );

    // Called on any cancel/escape path — clears state and shows main menu.
    const handleCancel = async (triggerCtx: Context) => {
      await clearState();
      if (triggerCtx.callbackQuery) {
        await triggerCtx.answerCallbackQuery();
      }
      await triggerCtx.reply(
        "❌  Cancelled\n\n" +
          "Your submission has been cancelled.\n\n" +
          "Use the Submit button to start a new submission.",
        { reply_markup: buildMainMenuKeyboard() },
      );
    };

    // ── Init ───────────────────────────────────────────────────────────────
    await conversation.external(() =>
      stateManager.startSubmissionFlow(telegramId, chatId),
    );

    const categories = await conversation.external(() =>
      flowService.getSelectableCategories(),
    );
    if (categories.length === 0) {
      await clearState();
      await ctx.reply(
        "⏸  No Submissions Available\n\n" +
          "No categories are accepting submissions right now.\n" +
          "Please check back later.",
      );
      return;
    }

    await ctx.reply(
      "📋  Select a Category\n\n" +
        "Choose a category below to start your submission:",
      { reply_markup: buildCategorySelectionKeyboard(categories) },
    );

    // ── Category selection ─────────────────────────────────────────────────
    // Uses conversation.wait() so we can intercept escape routes before they
    // are consumed by the waitForCallbackQuery otherwise handler.
    const categoryRegex = new RegExp(`^${SUBMISSION_CB.CATEGORY_PREFIX}(.+)$`);
    let categoryData = "";
    while (true) {
      const update = await conversation.wait();
      if (isEscapeUpdate(update)) {
        await handleCancel(update);
        return;
      }
      const data = update.callbackQuery?.data ?? "";
      if (categoryRegex.test(data)) {
        await update.answerCallbackQuery();
        categoryData = data;
        break;
      }
      if (update.callbackQuery) await update.answerCallbackQuery();
      await update.reply(
        "⚠️  Please use the buttons above to select a category.",
      );
    }

    const categoryId = categoryData.slice(SUBMISSION_CB.CATEGORY_PREFIX.length);
    const category = await conversation.external(() =>
      flowService.getCategory(categoryId),
    );
    if (!category) {
      await clearState();
      await ctx.reply(
        "❌  That category is no longer available.\n\n" +
          "Please use /submit to start a new submission.",
      );
      return;
    }

    await conversation.external(() => stateManager.setCategory(chatId, category));

    const recheckSource = await conversation.external(() =>
      category.recheckEnabled
        ? flowService.getRecheckSource(telegramId, category.id)
        : null,
    );

    const typePrompt =
      "━━━━━━━━━━━━━━━━━━━━━\n" +
      `📂  ${category.name}\n` +
      "━━━━━━━━━━━━━━━━━━━━━\n\n" +
      `📊  Daily Limit       ${category.dailyLimitEnabled ? `Enabled (${category.dailySubmitCount}/day)` : "Disabled"}\n` +
      `🔍  Duplicate Check   ${category.duplicateCheck ? "Enabled" : "Disabled"}\n\n` +
      "Choose your submission type:";

    await ctx.reply(typePrompt, {
      reply_markup: buildSubmissionTypeKeyboard(Boolean(recheckSource)),
    });

    // ── Type → Upload outer loop (Back re-enters type selection) ──────────
    let uploadedFileId = "";
    let uploadedFileName = "";
    let submissionType: "normal" | "recheck" = "normal";

    typeUploadLoop: while (true) {
      // ── Submission type selection ────────────────────────────────────────
      let submissionTypeData = "";
      while (true) {
        const update = await conversation.wait();
        if (isEscapeUpdate(update)) {
          await handleCancel(update);
          return;
        }
        const data = update.callbackQuery?.data ?? "";
        if (data === SUBMISSION_CB.TYPE_NORMAL || data === SUBMISSION_CB.TYPE_RECHECK) {
          await update.answerCallbackQuery();
          submissionTypeData = data;
          break;
        }
        if (update.callbackQuery) await update.answerCallbackQuery();
        await update.reply(
          "⚠️  Please choose a submission type using the buttons above.",
        );
      }

      const isRecheck = submissionTypeData === SUBMISSION_CB.TYPE_RECHECK;
      if (isRecheck && !recheckSource) {
        await clearState();
        await ctx.reply("❌  Recheck submissions are not available for this category.");
        return;
      }

      submissionType = isRecheck ? "recheck" : "normal";
      await conversation.external(() =>
        stateManager.setType(chatId, submissionType, recheckSource?.id ?? null),
      );

      await ctx.reply(
        "━━━━━━━━━━━━━━━━━━━━━\n" +
          "📎  Upload Your File\n" +
          "━━━━━━━━━━━━━━━━━━━━━\n\n" +
          "Send your .xlsx file now.\n\n" +
          "  ✔  Format:    Excel (.xlsx only)\n" +
          "  ✔  Max size:  10 MB",
        { reply_markup: buildUploadKeyboard() },
      );

      // ── File upload ──────────────────────────────────────────────────────
      // Back → re-show type selection. Cancel/escape → exit flow entirely.
      while (true) {
        const update = await conversation.wait();

        if (isEscapeUpdate(update)) {
          await handleCancel(update);
          return;
        }

        // ⬅️ Back — re-show type prompt and restart the outer loop
        if (update.callbackQuery?.data === SUBMISSION_CB.BACK) {
          await update.answerCallbackQuery();
          await update.reply(typePrompt, {
            reply_markup: buildSubmissionTypeKeyboard(Boolean(recheckSource)),
          });
          continue typeUploadLoop;
        }

        const doc = update.message?.document;
        if (!doc) {
          await update.reply(
            "⚠️  Please upload an Excel (.xlsx) file.",
            { reply_markup: buildUploadKeyboard() },
          );
          continue;
        }

        const validation = validateSubmissionFile(doc, maxFileSize);
        if (!validation.valid) {
          await update.reply(
            `⚠️  ${validation.error ?? "Invalid file. Please upload a valid .xlsx file."}`,
            { reply_markup: buildUploadKeyboard() },
          );
          continue;
        }

        await conversation.external(() =>
          stateManager.setFile(chatId, {
            fileId: doc.file_id,
            fileName: doc.file_name ?? "submission.xlsx",
            fileSize: doc.file_size ?? null,
            mimeType: doc.mime_type ?? null,
          }),
        );
        uploadedFileId = doc.file_id;
        uploadedFileName = doc.file_name ?? "submission.xlsx";
        break typeUploadLoop; // file accepted — proceed to processing
      }
    }

    await conversation.external(() => stateManager.complete(chatId));

    await ctx.reply(
      "━━━━━━━━━━━━━━━━━━━━━\n" +
        "⏳  Processing File\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Your file is being processed.\n" +
        "Please wait a moment...",
    );

    // ── Parse Excel ────────────────────────────────────────────────────────
    let parsed: Awaited<ReturnType<typeof downloadAndParseExcel>>;
    try {
      parsed = await conversation.external(() =>
        downloadAndParseExcel(uploadedFileId, env.TELEGRAM_BOT_TOKEN),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Excel parse failed", { fileId: uploadedFileId, error: msg });
      await clearState();
      await ctx.reply(
        "❌  Upload failed.\n\nPlease try again.",
        { reply_markup: buildMainMenuKeyboard() },
      );
      return;
    }

    const fileRef = `tg:${parsed.filePath}`;

    // ── Create submission ──────────────────────────────────────────────────
    let submission: Awaited<ReturnType<typeof submissionService.validateAndCreate>>;
    try {
      submission = await conversation.external(() =>
        submissionService.validateAndCreate(
          {
            telegramId,
            categoryId: category.id,
            categoryName: category.name,
            submissionType,
            fileName: uploadedFileName,
            fileUrl: fileRef,
            totalIds: parsed.totalIds,
            duplicateIds: parsed.duplicateIds,
            idList: parsed.uniqueIds,
            sourceSubmissionId: recheckSource?.id ?? null,
          },
          category,
        ),
      );
    } catch (err) {
      await clearState();
      if (err instanceof ValidationError) {
        await ctx.reply(
          `❌  ${err.message}`,
          { reply_markup: buildMainMenuKeyboard() },
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Submission creation failed", {
          telegramId,
          categoryId: category.id,
          error: msg,
        });
        await ctx.reply(
          "❌  Upload failed.\n\nPlease try again.",
          { reply_markup: buildMainMenuKeyboard() },
        );
      }
      return;
    }

    // ── Submission Report ──────────────────────────────────────────────────
    const invalidIds = Math.max(
      0,
      parsed.totalIds - parsed.duplicateIds - submission.oldIds - submission.validIds,
    );

    await ctx.reply(
      "━━━━━━━━━━━━━━━━━━━━━\n" +
        "✅  Submission Received\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        `📋  Category      ${category.name}\n` +
        `🆔  Submission    #${submission.id.slice(-8).toUpperCase()}\n\n` +
        "━━━━━━━━━━━━━━━━━━━━━\n" +
        "📊  Submission Report\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        `📥  Total IDs        ${submission.totalIds}\n` +
        `✅  Accepted IDs     ${submission.validIds}\n` +
        `🔁  Duplicate IDs    ${submission.duplicateIds}\n` +
        `🕐  Old IDs          ${submission.oldIds}\n` +
        `❌  Invalid IDs      ${invalidIds}\n\n` +
        "Your submission is now pending review.\n" +
        "You will be notified once it is processed.",
    );
  };
}
