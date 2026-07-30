import type { FirebaseApp } from "../config/firebase";
import { submittedIdDocKey, type SubmittedId } from "../models/SubmittedId";
import { logger } from "../core/logger";

const COLLECTION = "submitted_ids";

export class SubmittedIdRepository {
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  /**
   * Given a deduplicated list of UIDs and a category, separates them into:
   *   - oldIds: UIDs already present in submitted_ids for this category
   *   - newIds: UIDs not yet present (safe to accept and index)
   *
   * Uses Firestore batchGet so the entire list is checked in
   * ⌈ids.length / 100⌉ HTTP requests instead of one request per UID.
   */
  async separateOldIds(
    ids: string[],
    categoryId: string,
  ): Promise<{ oldIds: string[]; newIds: string[] }> {
    if (ids.length === 0) return { oldIds: [], newIds: [] };

    const docKeys = ids.map((uid) => submittedIdDocKey(categoryId, uid));
    const existingKeys = await this.db.batchGetExists(COLLECTION, docKeys);

    const oldIds: string[] = [];
    const newIds: string[] = [];
    for (const uid of ids) {
      if (existingKeys.has(submittedIdDocKey(categoryId, uid))) {
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
   * Uses Firestore commit so all writes are sent in
   * ⌈ids.length / 500⌉ HTTP requests instead of one request per UID.
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

    const docs = ids.map((uid) => ({
      id: submittedIdDocKey(categoryId, uid),
      data: {
        uid,
        categoryId,
        submissionId,
        submittedBy,
        submittedAt,
        status: "active",
      } as unknown as Record<string, unknown>,
    }));

    await this.db.batchSetDocs(COLLECTION, docs);

    logger.info("Indexed submitted IDs", {
      count: ids.length,
      categoryId,
      submissionId,
    });
  }
}
