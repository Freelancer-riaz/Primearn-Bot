import type { FirebaseApp } from "../config/firebase";
import type { Session } from "../models/Session";
import { logger } from "../core/logger";

const COLLECTION = "sessions";

export class SessionRepository {
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  async get(telegramId: number): Promise<Session | null> {
    const snap = await this.db
      .collection(COLLECTION)
      .doc(String(telegramId))
      .get();
    if (!snap.exists) return null;
    return snap.data() as unknown as Session;
  }

  async upsert(telegramId: number): Promise<Session> {
    const now = new Date().toISOString();
    const existing = await this.get(telegramId);
    const ref = this.db.collection(COLLECTION).doc(String(telegramId));

    if (existing) {
      const updated: Session = { ...existing, lastActiveAt: now };
      await ref.set(updated as unknown as Record<string, unknown>);
      return updated;
    }

    const session: Session = {
      telegramId,
      createdAt: now,
      lastActiveAt: now,
    };

    await ref.set(session as unknown as Record<string, unknown>);
    logger.info("Session created", { telegramId });
    return session;
  }

  /**
   * Updates only lastActiveAt without reading the document first.
   * Faster than upsert — skips the GET round-trip.
   * Safe to call when the session is known to already exist (i.e. any
   * request that passes the auth middleware, since /start always runs upsert first).
   */
  async touch(telegramId: number): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .collection(COLLECTION)
      .doc(String(telegramId))
      .update({ lastActiveAt: now });
  }
}
