import type { FirebaseApp } from "../config/firebase";
import { UserRepository } from "../repositories/UserRepository";
import { StatsRepository } from "../repositories/StatsRepository";
import type { UserProfile } from "../models/UserProfile";
import { logger } from "../core/logger";

export class ProfileService {
  private userRepo: UserRepository;
  private statsRepo: StatsRepository;

  constructor(app: FirebaseApp) {
    this.userRepo = new UserRepository(app);
    this.statsRepo = new StatsRepository(app);
  }

  /**
   * Returns the full profile (user + stats) for the given Telegram ID.
   * Returns null if the user is not registered.
   */
  async getProfile(telegramId: number): Promise<UserProfile | null> {
    // Fetch user and stats in parallel — they are independent Firestore reads.
    const [user, stats] = await Promise.all([
      this.userRepo.findByTelegramId(telegramId),
      this.statsRepo.getStats(telegramId),
    ]);

    if (!user) {
      logger.warn("Profile requested for unregistered user", { telegramId });
      return null;
    }

    return { user, stats };
  }
}
