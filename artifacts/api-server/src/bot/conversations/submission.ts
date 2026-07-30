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

/** Returns true when the update should immediately exit the conversation. */
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

/** Formats a processing / upload error into an inline-keyboard error screen. */
function buildProcessErrorScreen(reason: string): string {
  return (
    "━━━━━━━━━━━━━━━━━━━━━\n" +
    "❌  Upload Failed\n" +
    "━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "Reason:\n" +
    `${reason}\n\n` +
    "Press ⬅️ Back to upload another file\n" +
    "or ❌ Cancel to exit."
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

    /**
     * Single navigation message tracker.
     * All screens edit this one message in-place via editMessageText.
     */
    const nav = { msgId: 0 };

    /**
     * Edits the existing navigation message in-place.
     * Creates a fresh message if none exists yet or if the previous one was deleted.
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
          if (
            e.error_code === 400 &&
            e.description?.includes("message is not modified")
          ) {
            return; // identical content — nothing to do
          }
          nav.msgId = 0; // message gone or other error — fall through
        }
      }
      const sent = await ctx.reply(text, { reply_markup: keyboard });
      nav.msgId = sent.message_id;
    };

    const clearState = () =>
      conversation.external(() =>
        stateManager.getStorage().deleteSubmissionFlow(chatId),
      );

    /**
     * Removes the inline keyboard from the nav message then sends the cancel
     * screen as a new reply so the main-menu reply keyboard is restored.
     */
    const handleCancel = async (triggerCtx: Context) => {
      await clearState();
      if (triggerCtx.callbackQuery) {
        await triggerCtx.answerCallbackQuery();
      }
      if (nav.msgId) {
        try {
          await ctx.api.editMessageReplyMarkup(chatId, nav.msgId, {
            reply_markup: new InlineKeyboard(),
          });
        } catch {
          // ignore — message may already be gone
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

    const categoryRegex = new RegExp(`^${SUBMISSION_CB.CATEGORY_PREFIX}(.+)$`);

    // ── Outer loop: Back from Type returns here ────────────────────────────
    categoryLoop: while (true) {
      await showNav(categorySelectionText, buildCategorySelectionKeyboard(categories));

      let selectedCategoryId = "";
      while (true) {
        const update = await conversation.wait();
        if (isEscapeUpdate(update)) { await handleCancel(update); return; }

        // Back on first screen = cancel (no previous screen)
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

      // ── Middle loop: Back from Upload returns here ─────────────────────
      typeUploadLoop: while (true) {
        await showNav(typePrompt, buildSubmissionTypeKeyboard(Boolean(recheckSource)));

        let submissionTypeData = "";
        while (true) {
          const update = await conversation.wait();
          if (isEscapeUpdate(update)) { await handleCancel(update); return; }

          if (update.callbackQuery?.data === SUBMISSION_CB.BACK) {
            await update.answerCallbackQuery();
            continue categoryLoop; // Back → Category Selection
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
          await showNav(
            "❌  Recheck submissions are not available for this category.",
            new InlineKeyboard(),
          );
          await ctx.reply("Use the Submit button to start again.", {
            reply_markup: buildMainMenuKeyboard(),
          });
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

        // ── Inner loop: Back from error screen returns here ──────────────
        uploadLoop: while (true) {
          await showNav(uploadText, buildUploadKeyboard());

          // ── Wait for a valid file ──────────────────────────────────────
          let uploadedFileId = "";
          let uploadedFileName = "";

          fileWait: while (true) {
            const update = await conversation.wait();
            if (isEscapeUpdate(update)) { await handleCancel(update); return; }

            if (update.callbackQuery?.data === SUBMISSION_CB.BACK) {
              await update.answerCallbackQuery();
              continue typeUploadLoop; // Back → Type Selection
            }
            if (update.callbackQuery) {
              await update.answerCallbackQuery();
              continue fileWait;
            }

            const doc = update.message?.document;
            if (!doc) continue fileWait;

            const validation = validateSubmissionFile(doc, maxFileSize);
            if (!validation.valid) {
              await showNav(
                "━━━━━━━━━━━━━━━━━━━━━\n" +
                  "📎  Upload Your File\n" +
                  "━━━━━━━━━━━━━━━━━━━━━\n\n" +
                  `⚠️  ${validation.error ?? "Invalid file. Please upload a valid .xlsx file."}\n\n` +
                  "  ✔  Format:    Excel (.xlsx only)\n" +
                  "  ✔  Max size:  10 MB",
                buildUploadKeyboard(),
              );
              continue fileWait;
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
            break fileWait;
          }

          // ── Processing screen — edit nav message in-place ──────────────
          await conversation.external(() => stateManager.complete(chatId));
          await showNav(
            "━━━━━━━━━━━━━━━━━━━━━\n" +
              "⏳  Processing File\n" +
              "━━━━━━━━━━━━━━━━━━━━━\n\n" +
              "Your file is being processed.\n" +
              "Please wait...",
            new InlineKeyboard(),
          );

          // ── Parse + submit — errors edit nav message and keep flow alive ─
          type Parsed = Awaited<ReturnType<typeof downloadAndParseExcel>>;
          type Submission = Awaited<ReturnType<typeof submissionService.validateAndCreate>>;

          let parsed: Parsed | null = null;
          let submission: Submission | null = null;
          let processErrorMsg: string | null = null;

          try {
            parsed = await conversation.external(() =>
              downloadAndParseExcel(uploadedFileId, env.TELEGRAM_BOT_TOKEN),
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            logger.error("Submission upload failed", {
              error: msg,
              stack,
              telegramId,
              categoryId: category.id,
            });
            processErrorMsg = msg;
          }

          if (parsed !== null) {
            try {
              submission = await conversation.external(() =>
                submissionService.validateAndCreate(
                  {
                    telegramId,
                    categoryId: category.id,
                    categoryName: category.name,
                    submissionType,
                    fileName: uploadedFileName,
                    fileUrl: `tg:${parsed!.filePath}`,
                    totalIds: parsed!.totalIds,
                    duplicateIds: parsed!.duplicateIds,
                    idList: parsed!.uniqueIds,
                    sourceSubmissionId: recheckSource?.id ?? null,
                  },
                  category,
                ),
              );
            } catch (err) {
              const msg =
                err instanceof ValidationError
                  ? err.message
                  : err instanceof Error
                    ? err.message
                    : String(err);
              const stack = err instanceof Error ? err.stack : undefined;
              logger.error("Submission upload failed", {
                error: msg,
                stack,
                telegramId,
                categoryId: category.id,
              });
              processErrorMsg = msg;
            }
          }

          // ── Error: show error screen, wait for Back or Cancel ───────────
          if (parsed === null || submission === null) {
            await showNav(
              buildProcessErrorScreen(processErrorMsg ?? "Unknown error"),
              buildUploadKeyboard(),
            );

            errorWait: while (true) {
              const errUpdate = await conversation.wait();
              if (isEscapeUpdate(errUpdate)) { await handleCancel(errUpdate); return; }
              if (errUpdate.callbackQuery?.data === SUBMISSION_CB.BACK) {
                await errUpdate.answerCallbackQuery();
                continue uploadLoop; // Back → re-show upload screen
              }
              if (errUpdate.callbackQuery) await errUpdate.answerCallbackQuery();
            }

            // TypeScript: unreachable — errorWait only exits via continue/return
            continue uploadLoop;
          }

          // ── Success: edit nav message to show Submission Report ─────────
          const invalidIds = Math.max(
            0,
            parsed.totalIds - parsed.duplicateIds - submission.oldIds - submission.validIds,
          );

          await showNav(
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
            new InlineKeyboard(),
          );

          return;
        }
      }
    }
  };
}
