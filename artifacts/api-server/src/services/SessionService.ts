import type { FirebaseApp } from "../config/firebase";
import { SessionRepository } from "../repositories/SessionRepository";
import type { Session } from "../models/Session";
import { logger } from "../core/logger";

export class SessionService {
  private sessionRepo: SessionRepository;

  constructor(app: FirebaseApp) {
    this.sessionRepo = new SessionRepository(app);
  }

  async get(telegramId: number): Promise<Session | null> {
    return this.sessionRepo.get(telegramId);
  }

  /**
   * Update lastActiveAt without a read round-trip.
   * Uses a write-only PATCH instead of the read-then-write upsert path.
   */
  async touch(telegramId: number): Promise<void> {
    await this.sessionRepo.touch(telegramId);
    logger.debug("Session updated", { telegramId });
  }
}
