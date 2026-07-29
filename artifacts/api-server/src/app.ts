import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import type { Context } from "hono";
import type { Env } from "./config/env";
import { initFirebase } from "./config/firebase";
import { createWebhookHandler } from "./bot";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./core/logger";
import { adminRouter } from "./admin";

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use("*", honoLogger());

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (c) =>
  c.json({ ok: true, service: "PrimeEarn Bot", version: "1.0.0" }),
);

// ── Telegram Webhook ─────────────────────────────────────────────────────────
async function handleWebhook(c: Context<{ Bindings: Env }>) {
  // Validate secret header before doing any work
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== c.env.WEBHOOK_SECRET) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  // Validate that required secrets are bound
  const requiredVars: (keyof Env)[] = [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "TELEGRAM_BOT_TOKEN",
  ];
  const missing = requiredVars.filter((k) => !c.env[k]);
  if (missing.length > 0) {
    logger.error("Missing required environment bindings", { missing });
    // Still return 200 so Telegram stops retrying; this is a config error
    return c.text("ok", 200);
  }

  try {
    initFirebase(c.env);
    const handler = createWebhookHandler(c.env);
    return await handler(c);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("Webhook handler threw an unhandled exception", {
      error: message,
      stack,
    });
    // Always return 200 to Telegram so it does not retry the same update
    return c.text("ok", 200);
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────
app.route("/api/admin", adminRouter);

// Primary path (matches registered Telegram webhook URL)
app.post("/webhook", handleWebhook);
// Legacy / internal path kept for backwards compatibility
app.post("/api/webhook", handleWebhook);

// ── Error & 404 ───────────────────────────────────────────────────────────────
app.onError(errorHandler);
app.notFound(async (c) => {
  const path = c.req.path;

  // API and webhook routes: keep existing JSON 404 behaviour
  if (
    path.startsWith("/api/") ||
    path === "/api" ||
    path === "/webhook"
  ) {
    logger.warn("Route not found", { path });
    return c.json({ ok: false, error: "Not found" }, 404);
  }

  // Try to serve the real asset (JS, CSS, images, etc.) first.
  // If Workers Assets returns 404, fall back to index.html for SPA routing.
  const assetRes = await c.env.ASSETS.fetch(c.req.raw);
  if (assetRes.status === 404) {
    return c.env.ASSETS.fetch(
      new Request(new URL("/index.html", c.req.url).toString()),
    );
  }
  return assetRes;
});

export { app };
