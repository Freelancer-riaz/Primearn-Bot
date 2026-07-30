import type { Context } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import {
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import type { Env } from "../../config/env";
import { ConversationStateManager } from "../../services/ConversationStateManager";
import { SubmissionFlowService } from "../../services/SubmissionFlowService";
import { SubmissionService } from "../../services/SubmissionService";
import { buildCategorySelectionKeyboard, buildSubmissionTypeKeyboard, SUBMISSION_CB } from "../keyboards/submissionKeyboard";
import { getSubmissionMaxFileSize, validateSubmissionFile } from "../validation/fileValidation";
import { downloadAndParseExcel } from "../../lib/excel/parseSubmissionFile";
import { ValidationError } from "../../core/errors/AppError";
import type { PrimeEarnContext } from "../types";
import { logger } from "../../core/logger";

type SubmissionConversation = Conversation<PrimeEarnContext, Context>;

export function createSubmissionConversation(
  app: FirebaseApp,
  env: Env,
) {
  const flowService = new SubmissionFlowService(app);
  const stateManager = new ConversationStateManager(app);
  const submissionService = new SubmissionService(app);
  const maxFileSize = getSubmissionMaxFileSize(
    env.SUBMISSION_MAX_FILE_SIZE_BYTES,
  );

  return async function submissionConversation(
    conversation: SubmissionConversation,
    ctx: Context,
  ): Promise<void> {
    if (!ctx.from || !ctx.chatId) return;

    const telegramId = ctx.from.id;
    const chatId = ctx.chatId;
    await conversation.external(() =>
      stateManager.startSubmissionFlow(telegramId, chatId),
    );

    const categories = await conversation.external(() =>
      flowService.getSelectableCategories(),
    );
    if (categories.length === 0) {
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
      {
        reply_markup: buildCategorySelectionKeyboard(categories),
      },
    );

    console.log("WAITING_FOR_CATEGORY");
    const categoryContext = await conversation.waitForCallbackQuery(
      new RegExp(`^${SUBMISSION_CB.CATEGORY_PREFIX}(.+)$`),
      {
        otherwise: async (otherContext) => {
          if (otherContext.callbackQuery) {
            await otherContext.answerCallbackQuery();
          }
          await otherContext.reply(
            "⚠️  Please use the buttons above to select a category.",
          );
        },
      },
    );
    console.log("CATEGORY_CALLBACK_RECEIVED");
    console.log("callbackQuery.data:", categoryContext.callbackQuery.data);
    await categoryContext.answerCallbackQuery();

    const categoryId = categoryContext.callbackQuery.data.slice(
      SUBMISSION_CB.CATEGORY_PREFIX.length,
    );
    const category = await conversation.external(() =>
      flowService.getCategory(categoryId),
    );
    if (!category) {
      await categoryContext.reply(
        "❌  That category is no longer available.\n\n" +
        "Please use /submit to start a new submission.",
      );
      return;
    }

    await conversation.external(() =>
      stateManager.setCategory(chatId, category),
    );

    const recheckSource = await conversation.external(() =>
      category.recheckEnabled
        ? flowService.getRecheckSource(telegramId, category.id)
        : null,
    );

    await categoryContext.reply(
      "━━━━━━━━━━━━━━━━━━━━━\n" +
        `📂  ${category.name}\n` +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        `📊  Daily Limit       ${category.dailyLimitEnabled ? `Enabled (${category.dailySubmitCount}/day)` : "Disabled"}\n` +
        `🔍  Duplicate Check   ${category.duplicateCheck ? "Enabled" : "Disabled"}\n\n` +
        "Choose your submission type:",
      {
        reply_markup: buildSubmissionTypeKeyboard(Boolean(recheckSource)),
      },
    );

    const typeContext = await conversation.waitForCallbackQuery(
      [SUBMISSION_CB.TYPE_NORMAL, SUBMISSION_CB.TYPE_RECHECK],
      {
        otherwise: async (otherContext) => {
          if (otherContext.callbackQuery) {
            await otherContext.answerCallbackQuery();
          }
          await otherContext.reply(
            "⚠️  Please choose a submission type using the buttons above.",
          );
        },
      },
    );
    await typeContext.answerCallbackQuery();

    const isRecheck = typeContext.callbackQuery.data === SUBMISSION_CB.TYPE_RECHECK;
    if (isRecheck && !recheckSource) {
      await typeContext.reply(
        "❌  Recheck submissions are not available for this category.",
      );
      return;
    }

    const submissionType = isRecheck ? "recheck" : "normal";
    await conversation.external(() =>
      stateManager.setType(
        chatId,
        submissionType,
        recheckSource?.id ?? null,
      ),
    );

    await typeContext.reply(
      "━━━━━━━━━━━━━━━━━━━━━\n" +
        "📎  Upload Your File\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Send your .xlsx file now.\n\n" +
        "  ✔  Format:    Excel (.xlsx only)\n" +
        "  ✔  Max size:  10 MB",
    );

    while (true) {
      const fileContext = await conversation.waitFor("message:document", {
        otherwise: (otherContext) =>
          otherContext.reply(
            "⚠️  Please upload a valid .xlsx document file.",
          ),
      });
      const document = fileContext.msg.document;
      const validation = validateSubmissionFile(document, maxFileSize);
      if (!validation.valid) {
        await fileContext.reply(
          `⚠️  ${validation.error ?? "Invalid file. Please upload a valid .xlsx file."}`,
        );
        continue;
      }

      await conversation.external(() =>
        stateManager.setFile(chatId, {
          fileId: document.file_id,
          fileName: document.file_name!,
          fileSize: document.file_size ?? null,
          mimeType: document.mime_type ?? null,
        }),
      );
      break;
    }

    await conversation.external(() => stateManager.complete(chatId));

    await ctx.reply(
      "━━━━━━━━━━━━━━━━━━━━━\n" +
        "⏳  Processing File\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Your file is being processed.\n" +
        "Please wait a moment...",
    );

    // ── Parse Excel & create submission ────────────────────────────────────────
    // Retrieve the saved file ID from state, then download + parse the Excel.
    const state = await conversation.external(() =>
      stateManager.getStorage().getSubmissionFlow(chatId),
    );

    if (!state?.file) {
      await ctx.reply("❌  Could not retrieve your uploaded file. Please use /submit to try again.");
      return;
    }

    // Download the file from Telegram and extract UIDs from Column A.
    let parsed: Awaited<ReturnType<typeof downloadAndParseExcel>>;
    try {
      parsed = await conversation.external(() =>
        downloadAndParseExcel(state.file!.fileId, env.TELEGRAM_BOT_TOKEN),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Excel parse failed", { fileId: state.file.fileId, error: msg });
      await ctx.reply(
        "❌  Failed to read your Excel file.\n\n" +
          "Please make sure it is a valid .xlsx file with IDs in Column A, then use /submit to try again.",
      );
      return;
    }

    // Build a stable file reference (Telegram file_path, no token embedded).
    const fileRef = `tg:${parsed.filePath}`;

    // Call SubmissionService with the real idList — this triggers Old ID Detection.
    let submission: Awaited<ReturnType<typeof submissionService.validateAndCreate>>;
    try {
      submission = await conversation.external(() =>
        submissionService.validateAndCreate(
          {
            telegramId,
            categoryId: category.id,
            categoryName: category.name,
            submissionType,
            fileName: state.file!.fileName,
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
      if (err instanceof ValidationError) {
        await ctx.reply(`❌  ${err.message}`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Submission creation failed", { telegramId, categoryId: category.id, error: msg });
        await ctx.reply(
          "❌  An error occurred while processing your submission.\n\n" +
            "Please try again later or contact support.",
        );
      }
      return;
    }

    // ── Submission Report ─────────────────────────────────────────────────────
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
