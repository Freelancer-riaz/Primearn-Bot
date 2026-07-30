import type { FirebaseApp } from "../config/firebase";
import { submittedIdDocKey, type SubmittedId } from "../models/SubmittedId";
import { logger } from "../core/logger";

const COLLECTION = "submitted_ids";

export class SubmittedIdRepository {
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  private col() {
    return this.db.collection(COLLECTION);
  }

  /**
   * Given a list of raw IDs and a category, returns two buckets:
   *   - oldIds:  IDs that already exist in submitted_ids for this category
   *   - newIds:  IDs that do NOT exist (safe to submit and index)
   *
   * All existence checks run in parallel for speed.
   */
  async separateOldIds(
    ids: string[],
    categoryId: string,
  ): Promise<{ oldIds: string[]; newIds: string[] }> {
    if (ids.length === 0) return { oldIds: [], newIds: [] };

    const checks = await Promise.all(
      ids.map(async (uid) => {
        const snap = await this.col()
          .doc(submittedIdDocKey(categoryId, uid))
          .get();
        return { uid, exists: snap.exists };
      }),
    );

    const oldIds: string[] = [];
    const newIds: string[] = [];
    for (const { uid, exists } of checks) {
      if (exists) {
        oldIds.push(uid);
      } else {
        newIds.push(uid);
      }
    }

    return { oldIds, newIds };
  }

  /**
   * Persists a batch of NEW IDs into submitted_ids.
   *
   * Only call this AFTER the parent submission document has been successfully
   * created. Duplicate and old IDs must already be excluded from the list.
   *
   * All writes run in parallel.
   */
  async saveIds(
    ids: string[],
    categoryId: string,
    submissionId: string,
    telegramId: number,
  ): Promise<void> {
    if (ids.length === 0) return;

    const submittedAt = new Date().toISOString();
    const submittedBy = String(telegramId);

    await Promise.all(
      ids.map((uid) => {
        const docData: SubmittedId = {
          uid,
          categoryId,
          submissionId,
          submittedBy,
          submittedAt,
          status: "active",
        };
        return this.col()
          .doc(submittedIdDocKey(categoryId, uid))
          .set(docData as unknown as Record<string, unknown>);
      }),
    );

    logger.info("Indexed submitted IDs", {
      count: ids.length,
      categoryId,
      submissionId,
    });
  }
}
