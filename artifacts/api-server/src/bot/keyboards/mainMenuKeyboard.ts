import { Keyboard } from "grammy";

/** Button labels — used both to build the keyboard and to match incoming text. */
export const MENU_BUTTONS = {
  PROFILE: "👤 Profile",
  WALLET: "💎 Wallet",
  SUBMIT: "📤 Submit",
  REPORT: "📈 Report",
  HISTORY: "🗂 History",
  SETTINGS: "⚙️ Settings",
} as const;

/**
 * Persistent Reply Keyboard shown to every registered user.
 * Stays visible until explicitly removed — no need to resend after each command.
 */
export function buildMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MENU_BUTTONS.PROFILE).text(MENU_BUTTONS.WALLET).row()
    .text(MENU_BUTTONS.SUBMIT).text(MENU_BUTTONS.REPORT).row()
    .text(MENU_BUTTONS.HISTORY).text(MENU_BUTTONS.SETTINGS)
    .resized()
    .persistent();
}
