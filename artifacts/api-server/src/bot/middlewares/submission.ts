import type { Context, NextFunction } from "grammy";
import type { FirebaseApp } from "../../config/firebase";
import { SubmissionFlowService } from "../../services/SubmissionFlowService";
import { SUBMISSION_CB } from "../keyboards/submissionKeyboard";

const CATEGORY_CALLBACK = /^submit:category:(.+)$/;

export function createSubmissionMiddleware(app: FirebaseApp) {
  const flowService = new SubmissionFlowService(app);

  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const data = ctx.callbackQuery?.data;
    if (!data?.startsWith("submit:")) return next();

    const categoryMatch = data.match(CATEGORY_CALLBACK);
    if (categoryMatch) {
      const category = await flowService.getCategory(categoryMatch[1]!);
      if (!category) {
        await ctx.answerCallbackQuery({
          text: "This category is not available right now.",
          show_alert: true,
        });
        return;
      }
    } else if (
      data !== SUBMISSION_CB.TYPE_NORMAL &&
      data !== SUBMISSION_CB.TYPE_RECHECK
    ) {
      await ctx.answerCallbackQuery({
        text: "Invalid submission selection.",
        show_alert: true,
      });
      return;
    }

    return next();
  };
}