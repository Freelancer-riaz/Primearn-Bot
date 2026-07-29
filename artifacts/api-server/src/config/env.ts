/**
 * Cloudflare Worker environment bindings interface.
 * All secrets are injected by Wrangler at runtime.
 */
export interface Env {
  // Firebase — Admin SDK service account (replaces individual client SDK vars)
  FIREBASE_SERVICE_ACCOUNT_JSON: string;

  // Telegram
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;

  // Admin
  ADMIN_SECRET: string;

  // App
  NODE_ENV?: string;
  SUBMISSION_MAX_FILE_SIZE_BYTES?: string;
}
