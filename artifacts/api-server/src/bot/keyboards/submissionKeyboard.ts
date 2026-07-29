import { InlineKeyboard } from "grammy";
import type { Category } from "../../models/Category";

export const SUBMISSION_CB = {
  CATEGORY_PREFIX: "submit:category:",
  TYPE_NORMAL: "submit:type:normal",
  TYPE_RECHECK: "submit:type:recheck",
} as const;

export function buildCategorySelectionKeyboard(
  categories: Category[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  categories.forEach((category) => {
    keyboard.text(`📂 ${category.name}`, `${SUBMISSION_CB.CATEGORY_PREFIX}${category.id}`).row();
  });
  return keyboard;
}

export function buildSubmissionTypeKeyboard(
  allowRecheck: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard().text(
    "📤 Normal Submission",
    SUBMISSION_CB.TYPE_NORMAL,
  );
  if (allowRecheck) {
    keyboard.row().text("🔁 Recheck Submission", SUBMISSION_CB.TYPE_RECHECK);
  }
  return keyboard;
}