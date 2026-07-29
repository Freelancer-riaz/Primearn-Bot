import { InlineKeyboard } from "grammy";

export const PROFILE_CB = {
  REFRESH: "profile:refresh",
  CLOSE: "profile:close",
} as const;

/**
 * Inline keyboard for the profile message.
 * Add more buttons here as features are added.
 */
export function buildProfileKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Refresh", PROFILE_CB.REFRESH)
    .text("❌ Close", PROFILE_CB.CLOSE);
}
