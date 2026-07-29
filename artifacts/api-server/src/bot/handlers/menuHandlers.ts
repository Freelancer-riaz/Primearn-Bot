import type { FirebaseApp } from "../../config/firebase";
import { createProfileCommand } from "../commands/profile";
import { createSubmitCommand } from "../commands/submit";
import type { PrimeEarnContext } from "../types";

/**
 * Handler for menu buttons that delegate to existing command logic.
 * Keeps all business logic in the original command handlers — this file
 * only wires button text to those handlers.
 */

export function createProfileMenuHandler(app: FirebaseApp) {
  const handler = createProfileCommand(app);
  return (ctx: PrimeEarnContext) => handler(ctx);
}

export function createSubmitMenuHandler() {
  const handler = createSubmitCommand();
  return (ctx: PrimeEarnContext) => handler(ctx);
}

export async function handleWalletButton(ctx: PrimeEarnContext): Promise<void> {
  await ctx.reply("💎 Wallet feature is coming soon.");
}

export async function handleReportButton(ctx: PrimeEarnContext): Promise<void> {
  await ctx.reply("📈 Report feature is coming soon.");
}

export async function handleHistoryButton(ctx: PrimeEarnContext): Promise<void> {
  await ctx.reply("🗂 History feature is coming soon.");
}

export async function handleSettingsButton(ctx: PrimeEarnContext): Promise<void> {
  await ctx.reply("⚙️ Settings feature is coming soon.");
}
