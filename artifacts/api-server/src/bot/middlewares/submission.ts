import type { Context, NextFunction } from "grammy";
import { SUBMISSION_CB } from "../keyboards/submissionKeyboard";

const CATEGORY_CALLBACK = new RegExp(`^${SUBMISSION_CB.CATEGORY_PREFIX}(.+)$`);

export function createSubmissionMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const data = ctx.callbackQuery?.data;
    if (!data?.startsWith("submit:")) return next();
    console.log("SUBMISSION_MIDDLEWARE: callback data received:", data);

    if (
      CATEGORY_CALLBACK.test(data) ||
      data === SUBMISSION_CB.TYPE_NORMAL ||
      data === SUBMISSION_CB.TYPE_RECHECK
    ) {
      return next();
    }

    await ctx.answerCallbackQuery({
      text: "Invalid submission selection.",
      show_alert: true,
    });
  };
}
