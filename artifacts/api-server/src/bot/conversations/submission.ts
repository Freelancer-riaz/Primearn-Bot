import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
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

    // Tracks the single navigation message that gets edited in-place throughout
    // the flow. msgId = 0 means no message exists yet (or it was lost).
    const nav = { msgId: 0 };

    /**
     * Edits the existing navigation message in-place.
     * Falls back to sending a new message if:
     *   - No nav message exists yet
     *   - The previous message was deleted
     */
    const showNav = async (
      text: string,
      keyboard: InlineKeyboard,
    ): Promise<void> => {
      if (nav.msgId) {
        try {
          await ctx.api.editMessageText(chatId, nav.msgId, text, {
            reply_markup: keyboard,
          });
          return;
        } catch (err: unknown) {
          const e = err as { error_code?: number; description?: string };
          // "message is not modified" — identical content, nothing to do
          if (
            e.error_code === 400 &&
            e.description?.includes("message is not modified")
          ) {
            return;
          }
          // Message was deleted or any other Telegram error — create a new one
          nav.msgId = 0;
        }
      }
      const sent = await ctx.reply(text, { reply_markup: keyboard });
      nav.msgId = sent.message_id;
    };

    // Clears our custom Firestore submission draft state.
    const clearState = () =>
      conversation.external(() =>
        stateManager.getStorage().deleteSubmissionFlow(chatId),
      );

    /**
     * Called on any cancel/escape path.
     * Removes the inline keyboard from the nav message (keeps the text),
     * then sends a new message with the reply keyboard so the main menu is
     * immediately accessible — identical to the original cancel behaviour.
     */
    const handleCancel = async (triggerCtx: Context) => {
      await clearState();
      if (triggerCtx.callbackQuery) {
        await triggerCtx.answerCallbackQuery();
      }
      // Remove inline keyboard from the nav message so it doesn't look stale
      if (nav.msgId) {
        try {
          await ctx.api.editMessageReplyMarkup(chatId, nav.msgId, {
            reply_markup: new InlineKeyboard(),
          });
        } catch {
          // Ignore — message may already be gone
        }
      }
      await ctx.reply(
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

    const categorySelectionText =
      "📋  Select a Category\n\n" +
      "Choose a category below to start your submission:";

    // ── Outer category loop — Back from Type Selection returns here ─────────
    const categoryRegex = new RegExp(`^${SUBMISSION_CB.CATEGORY_PREFIX}(.+)$`);

    categoryLoop: while (true) {
      await showNav(categorySelectionText, buildCategorySelectionKeyboard(categories));

      // ── Category selection wait ──────────────────────────────────────────
      let selectedCategoryId = "";
      while (true) {
        const update = await conversation.wait();

        if (isEscapeUpdate(update)) {
          await handleCancel(update);
          return;
        }

        // Back on the first screen has no previous screen — treat as cancel
        if (update.callbackQuery?.data === SUBMISSION_CB.BACK) {
          await update.answerCallbackQuery();
          await handleCancel(update);
          return;
        }

        const data = update.callbackQuery?.data ?? "";
        if (categoryRegex.test(data)) {
          await update.answerCallbackQuery();
          selectedCategoryId = data.slice(SUBMISSION_CB.CATEGORY_PREFIX.length);
          break;
        }

        // Unknown callback — acknowledge silently, no new message
        if (update.callbackQuery) await update.answerCallbackQuery();
      }

      const category = await conversation.external(() =>
        flowService.getCategory(selectedCategoryId),
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

      // ── Type → Upload loop — Back from Upload returns here ─────────────
      typeUploadLoop: while (true) {
        await showNav(typePrompt, buildSubmissionTypeKeyboard(Boolean(recheckSource)));

        // ── Submission type selection wait ───────────────────────────────
        let submissionTypeData = "";
        while (true) {
          const update = await conversation.wait();

          if (isEscapeUpdate(update)) {
            await handleCancel(update);
            return;
          }

          // Back from Type Selection → return to Category Selection
          if (update.callbackQuery?.data === SUBMISSION_CB.BACK) {
            await update.answerCallbackQuery();
            continue categoryLoop;
          }

          const data = update.callbackQuery?.data ?? "";
          if (data === SUBMISSION_CB.TYPE_NORMAL || data === SUBMISSION_CB.TYPE_RECHECK) {
            await update.answerCallbackQuery();
            submissionTypeData = data;
            break;
          }

          if (update.callbackQuery) await update.answerCallbackQuery();
        }

        const isRecheck = submissionTypeData === SUBMISSION_CB.TYPE_RECHECK;
        if (isRecheck && !recheckSource) {
          await clearState();
          await ctx.reply(
            "❌  Recheck submissions are not available for this category.",
            { reply_markup: buildMainMenuKeyboard() },
          );
          return;
        }

        const submissionType: "normal" | "recheck" = isRecheck ? "recheck" : "normal";
        await conversation.external(() =>
          stateManager.setType(chatId, submissionType, recheckSource?.id ?? null),
        );

        const uploadText =
          "━━━━━━━━━━━━━━━━━━━━━\n" +
          "📎  Upload Your File\n" +
          "━━━━━━━━━━━━━━━━━━━━━\n\n" +
          "Send your .xlsx file now.\n\n" +
          "  ✔  Format:    Excel (.xlsx only)\n" +
          "  ✔  Max size:  10 MB";

        await showNav(uploadText, buildUploadKeyboard());

        // ── File upload wait ─────────────────────────────────────────────
        let uploadedFileId = "";
        let uploadedFileName = "";

        while (true) {
          const update = await conversation.wait();

          if (isEscapeUpdate(update)) {
            await handleCancel(update);
            return;
          }

          // Back from Upload → return to Type Selection
          if (update.callbackQuery?.data === SUBMISSION_CB.BACK) {
            await update.answerCallbackQuery();
            continue typeUploadLoop;
          }

          // Acknowledge any other callback silently
          if (update.callbackQuery) {
            await update.answerCallbackQuery();
            continue;
          }

          const doc = update.message?.document;
          if (!doc) {
            // Non-document message — ignore silently
            continue;
          }

          const validation = validateSubmissionFile(doc, maxFileSize);
          if (!validation.valid) {
            // Edit the nav message to show the error with the upload screen
            await showNav(
              "━━━━━━━━━━━━━━━━━━━━━\n" +
                "📎  Upload Your File\n" +
                "━━━━━━━━━━━━━━━━━━━━━\n\n" +
                `⚠️  ${validation.error ?? "Invalid file. Please upload a valid .xlsx file."}\n\n` +
                "  ✔  Format:    Excel (.xlsx only)\n" +
                "  ✔  Max size:  10 MB",
              buildUploadKeyboard(),
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

          // File accepted — show processing screen (edit nav message, no keyboard)
          await conversation.external(() => stateManager.complete(chatId));

          await showNav(
            "━━━━━━━━━━━━━━━━━━━━━\n" +
              "⏳  Processing File\n" +
              "━━━━━━━━━━━━━━━━━━━━━\n\n" +
              "Your file is being processed.\n" +
              "Please wait a moment...",
            new InlineKeyboard(),
          );

          // ── Parse Excel ────────────────────────────────────────────────
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

          // ── Create submission ──────────────────────────────────────────
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

          // ── Submission Report ──────────────────────────────────────────
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
            { reply_markup: buildMainMenuKeyboard() },
          );

          return;
        }
      }
    }
  };
}
