export type SubmissionType = "normal" | "recheck";
export type SubmissionStatus = "pending" | "processing" | "completed";
export type ReportStatus = "pending" | "ready" | "accepted";

export interface Submission {
  id: string; // Firestore document ID
  userId: string; // telegramId as string (matches users/{id})
  telegramId: number;
  categoryId: string;
  categoryName: string;
  submissionType: SubmissionType;

  // File
  fileName: string;
  fileUrl: string; // Firebase Storage URL

  // ID counts
  totalIds: number;
  duplicateIds: number; // duplicates within the uploaded file (Column A)
  validIds: number; // totalIds - duplicateIds

  // Timing
  submitDate: string; // "YYYY-MM-DD" — used for daily limit checks
  submitTime: string; // "HH:MM:SS"

  // Status
  status: SubmissionStatus;
  reportStatus: ReportStatus;

  // Recheck
  recheckEligible: boolean;
  recheckUsed: boolean;
  sourceSubmissionId: string | null; // null for normal; original ID for recheck

  // Admin
  adminNotes: string | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export type CreateSubmissionInput = Omit<
  Submission,
  "id" | "createdAt" | "updatedAt"
>;

export type UpdateSubmissionInput = Partial<
  Pick<
    Submission,
    | "status"
    | "reportStatus"
    | "recheckEligible"
    | "recheckUsed"
    | "adminNotes"
    | "duplicateIds"
    | "validIds"
  >
>;
