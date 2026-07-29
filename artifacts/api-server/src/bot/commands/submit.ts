import type { PrimeEarnContext } from "../types";

export function createSubmitCommand() {
  return async (ctx: PrimeEarnContext): Promise<void> => {
    if (ctx.conversation.active("submissionFlow")) {
      await ctx.reply("Your submission flow is already active. Please continue.");
      return;
    }
    await ctx.conversation.enter("submissionFlow");
  };
}