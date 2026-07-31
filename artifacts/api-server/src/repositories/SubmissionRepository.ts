import type { FirebaseApp } from "../config/firebase";
import type {
  Submission,
  CreateSubmissionInput,
  UpdateSubmissionInput,
} from "../models/Submission";
import type { Category } from "../models/Category";
import { logger } from "../core/logger";

const COLLECTION = "submissions";

export class SubmissionRepository {
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  private col() {
    return this.db.collection(COLLECTION);
  }

  /** Find a submission by Firestore document ID. */
  async findById(id: string): Promise<Submission | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as Submission;
  }

  /** Find a category by document ID for submission-flow validation. */
  async findCategoryById(id: string): Promise<Category | null> {
    const snap = await this.db.collection("categories").doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as Category;
  }

  /** Find an eligible original submission that can be rechecked. */
  async findRecheckSource(
    telegramId: number,
    categoryId: string,
  ): Promise<Submission | null> {
    const snap = await this.col()
      .where("telegramId", "==", telegramId)
      .where("categoryId", "==", categoryId)
      .where("submissionType", "==", "normal")
      .where("recheckEligible", "==", true)
      .where("recheckUsed", "==", false)
      .limit(1)
      .get();

    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return { id: d.id, ...d.data() } as Submission;
  }

  /** Get all submissions for a user, newest first. */
  async findByUser(telegramId: number): Promise<Submission[]> {
    const snap = await this.col()
      .where("telegramId", "==", telegramId)
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Submission);
  }

  /**
   * Check if a normal submission already exists for this user + category today.
   * Requires composite index: (telegramId, categoryId, submitDate, submissionType).
   */
  async findNormalSubmissionToday(
    telegramId: number,
    categoryId: string,
    date: string, // "YYYY-MM-DD"
  ): Promise<Submission | null> {
    const snap = await this.col()
      .where("telegramId", "==", telegramId)
      .where("categoryId", "==", categoryId)
      .where("submitDate", "==", date)
      .where("submissionType", "==", "normal")
      .limit(1)
      .get();

    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return { id: d.id, ...d.data() } as Submission;
  }

  /**
   * Count normal submissions created today (by UTC date stored in submitDate)
   * for a specific user + category. Uses equality filters only — no composite
   * index required beyond Firestore's automatic single-field indexes.
   *
   * A submission counts as soon as it is created in Firestore — regardless of
   * status or reportStatus. Only submissions that never reached Firestore
   * (failed validation, upload failures, cancellations) are excluded naturally.
   *
   * @param date - "YYYY-MM-DD" UTC date string (matches the submitDate field)
   */
  async countNormalSubmissionsOnDate(
    telegramId: number,
    categoryId: string,
    date: string,
  ): Promise<{ count: number; docs: Array<{ id: string; submitDate: unknown; submissionType: unknown }> }> {
    const snap = await this.col()
      .where("telegramId", "==", telegramId)
      .where("categoryId", "==", categoryId)
      .where("submitDate", "==", date)
      .where("submissionType", "==", "normal")
      .get();
    const docs = snap.docs.map((d) => ({
      id: d.id,
      submitDate: d.data()["submitDate"],
      submissionType: d.data()["submissionType"],
    }));
    return { count: snap.docs.length, docs };
  }

  /** Create a new submission document. */
  async create(input: CreateSubmissionInput): Promise<Submission> {
    const now = new Date().toISOString();
    const data = { ...input, createdAt: now, updatedAt: now };
    const ref = await this.col().add(data as unknown as Record<string, unknown>);
    logger.info("Submission created", {
      id: ref.id,
      telegramId: input.telegramId,
      categoryId: input.categoryId,
      type: input.submissionType,
    });
    return { id: ref.id, ...data };
  }

  /** Update mutable fields on a submission. */
  async update(id: string, input: UpdateSubmissionInput): Promise<void> {
    await this.col()
      .doc(id)
      .update({
        ...(input as Record<string, unknown>),
        updatedAt: new Date().toISOString(),
      });
    logger.info("Submission updated", { id });
  }
}
