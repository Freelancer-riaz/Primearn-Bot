import { Bot, webhookCallback } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { Env } from "../config/env";
import { initFirebase } from "../config/firebase";
import { registerCommands } from "./commands";
import { createAuthMiddleware } from "./middlewares/auth";
import { createSubmissionMiddleware } from "./middlewares/submission";
import { createSubmissionConversation } from "./conversations/submission";
import { ConversationStateManager } from "../services/ConversationStateManager";
import type { PrimeEarnContext } from "./types";
import { logger } from "../core/logger";

let botInstance: Bot<PrimeEarnContext> | null = null;

/**
 * Initializes the grammY bot singleton with auth middleware and commands.
 * Resets and retries on error so a broken cold-start does not persist.
 */
export function initBot(env: Env): Bot<PrimeEarnContext> {
  if (botInstance) return botInstance;

  try {
    const app = initFirebase(env);

    const bot = new Bot<PrimeEarnContext>(env.TELEGRAM_BOT_TOKEN);

    bot.use(createAuthMiddleware(app));
    bot.use(createSubmissionMiddleware());

    const conversationStateManager = new ConversationStateManager(app);
    bot.use(
      conversations<PrimeEarnContext, import("grammy").Context>({
        storage: {
          type: "key",
          version: 1,
          getStorageKey: (ctx) =>
            ctx.chatId === undefined ? undefined : String(ctx.chatId),
          adapter: conversationStateManager.getStorage(),
        },
      }),
    );
    bot.use(
      createConversation(
        createSubmissionConversation(app, env),
        "submissionFlow",
      ),
    );

    registerCommands(bot, app, env);

    botInstance = bot;
    logger.info("grammY bot initialized with auth middleware and commands");
    return botInstance;
  } catch (err) {
    // Reset singleton so the next request retries initialization cleanly
    botInstance = null;
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Bot initialization failed", { error: message });
    throw err;
  }
}

/**
 * Returns a Hono-compatible webhook handler for the bot.
 */
export function createWebhookHandler(env: Env) {
  const bot = initBot(env);
  return webhookCallback(bot, "hono");
}
