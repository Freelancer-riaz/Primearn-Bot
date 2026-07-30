import type { PrimeEarnContext } from "../types";
import { logger } from "../../core/logger";

export function createSubmitCommand() {
  return async (ctx: PrimeEarnContext): Promise<void> => {
    if (ctx.conversation.active("submissionFlow")) {
      await ctx.reply("Your submission flow is already active. Please continue.");
      return;
    }
    logger.info("BEFORE_ENTER", {
      telegramId: ctx.from?.id,
      chatId: ctx.chatId,
    });
    await ctx.conversation.enter("submissionFlow");
    logger.info("AFTER_ENTER", {
      telegramId: ctx.from?.id,
      chatId: ctx.chatId,
    });
  };
}