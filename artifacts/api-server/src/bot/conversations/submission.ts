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
      await ctx.reply("There are no categories accepting submissions right now.");
      return;
    }

    await ctx.reply("Select a category:", {
      reply_markup: buildCategorySelectionKeyboard(categories),
    });

    const categoryContext = await conversation.waitForCallbackQuery(
      new RegExp(`^${SUBMISSION_CB.CATEGORY_PREFIX}(.+)$`),
      {
        otherwise: async (otherContext) => {
          await otherContext.answerCallbackQuery();
          await otherContext.reply("Please select a category using the buttons above.");
        },
      },
    );
    await categoryContext.answerCallbackQuery();

    const categoryId = categoryContext.callbackQuery.data.slice(
      SUBMISSION_CB.CATEGORY_PREFIX.length,
    );
    const category = await conversation.external(() =>
      flowService.getCategory(categoryId),
    );
    if (!category) {
      await categoryContext.reply("That category is no longer available. Please use /submit again.");
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
      `Category: ${category.name}\n` +
        `Daily limit: ${category.dailyLimitEnabled ? "Enabled" : "Disabled"}\n` +
        `File duplicate check: ${category.duplicateCheck ? "Enabled" : "Disabled"}\n\n` +
        "Choose submission type:",
      {
        reply_markup: buildSubmissionTypeKeyboard(Boolean(recheckSource)),
      },
    );

    const typeContext = await conversation.waitForCallbackQuery(
      [SUBMISSION_CB.TYPE_NORMAL, SUBMISSION_CB.TYPE_RECHECK],
      {
        otherwise: async (otherContext) => {
          await otherContext.answerCallbackQuery();
          await otherContext.reply("Please choose Normal or Recheck Submission.");
        },
      },
    );
    await typeContext.answerCallbackQuery();

    const isRecheck = typeContext.callbackQuery.data === SUBMISSION_CB.TYPE_RECHECK;
    if (isRecheck && !recheckSource) {
      await typeContext.reply("Recheck is not available for this category.");
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
      "Upload your .xlsx file now. Excel parsing is not performed yet.",
    );

    while (true) {
      const fileContext = await conversation.waitFor("message:document", {
        otherwise: (otherContext) =>
          otherContext.reply("Please upload an .xlsx document file."),
      });
      const document = fileContext.msg.document;
      const validation = validateSubmissionFile(document, maxFileSize);
      if (!validation.valid) {
        await fileContext.reply(validation.error ?? "Invalid file.");
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
      "Your .xlsx file passed the foundation checks. Excel parsing and submission creation will be added in a later phase.",
    );
  };
}