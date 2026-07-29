import type { Context, NextFunction } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import { UserRepository } from "../../repositories/UserRepository";
import { SessionService } from "../../services/SessionService";
import { logger } from "../../core/logger";

/**
 * grammY middleware: verifies the user is registered before
 * processing any non-/start commands.
 */
export function createAuthMiddleware(app: FirebaseApp) {
  const userRepo = new UserRepository(app);
  const sessionService = new SessionService(app);

  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (!ctx.from) return next();

    const telegramId = ctx.from.id;
    const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? "";
    const isStart = text.startsWith("/start");

    // Allow /start through without auth check
    if (isStart) return next();

    const user = await userRepo.findByTelegramId(telegramId);

    if (!user) {
      logger.warn("Unregistered user blocked", { telegramId, text });
      await ctx.reply("⚠️ Please use /start to register first.");
      return;
    }

    // Refresh session on every authenticated interaction, then proceed.
    await sessionService.touch(telegramId);

    return next();
  };
}
