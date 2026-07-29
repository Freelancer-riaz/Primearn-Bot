import type { Bot } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import type { Env } from "../../config/env";
import type { PrimeEarnContext } from "../types";
import { createStartCommand } from "./start";
import {
  createProfileCommand,
  createProfileRefreshCallback,
  createProfileCloseCallback,
} from "./profile";
import { PROFILE_CB } from "../keyboards/profileKeyboard";
import { createSubmitCommand } from "./submit";
import { MENU_BUTTONS } from "../keyboards/mainMenuKeyboard";
import {
  createProfileMenuHandler,
  createSubmitMenuHandler,
  handleWalletButton,
  handleReportButton,
  handleHistoryButton,
  handleSettingsButton,
} from "../handlers/menuHandlers";

export function registerCommands(
  bot: Bot<PrimeEarnContext>,
  app: FirebaseApp,
  env: Env,
): void {
  // ── Commands ──────────────────────────────────────────────────────────────
  bot.command("start", createStartCommand(app, env.TELEGRAM_BOT_TOKEN));
  bot.command("profile", createProfileCommand(app));
  bot.command("submit", createSubmitCommand());

  // ── Callback Queries ──────────────────────────────────────────────────────
  bot.callbackQuery(PROFILE_CB.REFRESH, createProfileRefreshCallback(app));
  bot.callbackQuery(PROFILE_CB.CLOSE, createProfileCloseCallback());

  // ── Reply Keyboard Menu Buttons ───────────────────────────────────────────
  bot.hears(MENU_BUTTONS.PROFILE, createProfileMenuHandler(app));
  bot.hears(MENU_BUTTONS.SUBMIT, createSubmitMenuHandler());
  bot.hears(MENU_BUTTONS.WALLET, handleWalletButton);
  bot.hears(MENU_BUTTONS.REPORT, handleReportButton);
  bot.hears(MENU_BUTTONS.HISTORY, handleHistoryButton);
  bot.hears(MENU_BUTTONS.SETTINGS, handleSettingsButton);
}
