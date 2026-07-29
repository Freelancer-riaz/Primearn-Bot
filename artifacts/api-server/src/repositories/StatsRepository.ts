import type { FirebaseApp } from "../config/firebase";
import { DEFAULT_STATS, type UserStats } from "../models/UserProfile";

const COLLECTION = "user_stats";

export class StatsRepository {
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  /**
   * Returns stats for a user. Falls back to all-zero defaults if no
   * Firestore document exists — safe for newly registered users.
   */
  async getStats(telegramId: number): Promise<UserStats> {
    const snap = await this.db
      .collection(COLLECTION)
      .doc(String(telegramId))
      .get();

    if (!snap.exists) return { ...DEFAULT_STATS };

    // Merge with defaults so future new fields are never undefined
    return { ...DEFAULT_STATS, ...(snap.data() as Partial<UserStats>) };
  }
}
