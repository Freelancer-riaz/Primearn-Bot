import type { CommandContext, Context } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import { UserService } from "../../services/UserService";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { logger } from "../../core/logger";

export function createStartCommand(app: FirebaseApp, botToken: string) {
  const userService = new UserService(app);

  return async (ctx: CommandContext<Context>): Promise<void> => {
    if (!ctx.from) return;

    try {
      const { user, isNew } = await userService.registerOrLogin(
        ctx.from,
        ctx.api,
        botToken,
      );

      const keyboard = buildMainMenuKeyboard();

      if (isNew) {
        await ctx.reply(
          `Welcome to PrimeEarn, ${user.name}! 🎉\n\nYou are now registered and ready to earn.`,
          { reply_markup: keyboard },
        );
      } else {
        await ctx.reply(`Welcome back, ${user.name}! 👋`, {
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      logger.error("Error in /start command", { error: String(err) });
      await ctx.reply("Something went wrong. Please try again later.");
    }
  };
}
