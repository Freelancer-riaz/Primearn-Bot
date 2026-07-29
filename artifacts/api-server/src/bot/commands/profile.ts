import type { Context } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import { ProfileService } from "../../services/ProfileService";
import { buildProfileMessage } from "../messages/profileMessage";
import { buildProfileKeyboard } from "../keyboards/profileKeyboard";
import { logger } from "../../core/logger";

async function sendProfile(ctx: Context, app: FirebaseApp): Promise<void> {
  if (!ctx.from) return;

  const profileService = new ProfileService(app);
  const profile = await profileService.getProfile(ctx.from.id);

  if (!profile) {
    await ctx.reply("⚠️ Profile not found. Please use /start to register.");
    return;
  }

  const text = buildProfileMessage(profile);
  const keyboard = buildProfileKeyboard();

  if (profile.user.photoUrl) {
    try {
      await ctx.replyWithPhoto(profile.user.photoUrl, {
        caption: text,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      return;
    } catch (photoErr) {
      logger.warn("Profile photo URL unavailable, falling back to text", {
        error: String(photoErr),
      });
    }
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/** /profile command handler factory */
export function createProfileCommand(app: FirebaseApp) {
  return async (ctx: Context): Promise<void> => {
    try {
      await sendProfile(ctx, app);
    } catch (err) {
      logger.error("Error in /profile command", { error: String(err) });
      await ctx.reply("Could not load profile. Please try again.");
    }
  };
}

/** Callback: refresh the profile message in-place */
export function createProfileRefreshCallback(app: FirebaseApp) {
  return async (ctx: Context): Promise<void> => {
    try {
      await ctx.answerCallbackQuery();

      if (!ctx.from) return;

      const profileService = new ProfileService(app);
      const profile = await profileService.getProfile(ctx.from.id);

      if (!profile) return;

      const text = buildProfileMessage(profile);
      const keyboard = buildProfileKeyboard();

      // Edit caption if it's a photo message, otherwise edit text
      if (ctx.callbackQuery?.message && "photo" in ctx.callbackQuery.message) {
        await ctx.editMessageCaption({
          caption: text,
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      } else {
        await ctx.editMessageText(text, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      logger.error("Error in profile refresh callback", { error: String(err) });
    }
  };
}

/** Callback: delete the profile message */
export function createProfileCloseCallback() {
  return async (ctx: Context): Promise<void> => {
    try {
      await ctx.answerCallbackQuery();
      await ctx.deleteMessage();
    } catch (err) {
      logger.error("Error in profile close callback", { error: String(err) });
    }
  };
}
