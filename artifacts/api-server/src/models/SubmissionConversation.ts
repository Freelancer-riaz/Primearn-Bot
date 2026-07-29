export type SubmissionFlowStatus =
  | "started"
  | "category_selected"
  | "type_selected"
  | "file_received"
  | "completed";

export interface SubmissionFileDraft {
  fileId: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
}

export interface SubmissionConversationState {
  telegramId: number;
  chatId: number;
  status: SubmissionFlowStatus;
  categoryId: string | null;
  categoryName: string | null;
  submissionType: "normal" | "recheck" | null;
  sourceSubmissionId: string | null;
  dailyLimitEnabled: boolean | null;
  duplicateCheckEnabled: boolean | null;
  file: SubmissionFileDraft | null;
  createdAt: string;
  updatedAt: string;
}