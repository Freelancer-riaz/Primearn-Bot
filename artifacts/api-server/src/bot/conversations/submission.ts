import type { Context } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import {
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import type { Env } from "../../config/env";
import { ConversationStateManager } from "../../services/ConversationStateManager";
import { SubmissionFlowService } from "../../services/SubmissionFlowService";
import { buildCategorySelectionKeyboard, buildSubmissionTypeKeyboard, SUBMISSION_CB } from "../keyboards/submissionKeyboard";
import { getSubmissionMaxFileSize, validateSubmissionFile } from "../validation/fileValidation";
import type { PrimeEarnContext } from "../types";

type SubmissionConversation = Conversation<PrimeEarnContext, Context>;

export function createSubmissionConversation(
  app: FirebaseApp,
  env: Env,
) {
  const flowService = new SubmissionFlowService(app);
  const stateManager = new ConversationStateManager(app);
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
        "✅  File Received\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Your file has been uploaded successfully.\n" +
        "Your submission is now being processed.\n\n" +
        "You will receive the results shortly.",
    );
  };
}