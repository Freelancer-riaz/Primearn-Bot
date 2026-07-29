import type { Api, RawApi } from "grammy";
import type { User as TelegramUser } from "grammy/types";
import type { FirebaseApp } from "../config/firebase";
import { UserRepository } from "../repositories/UserRepository";
import { SessionRepository } from "../repositories/SessionRepository";
import type { User } from "../models/User";
import { logger } from "../core/logger";

export interface RegisterResult {
  user: User;
  isNew: boolean;
}

export class UserService {
  private userRepo: UserRepository;
  private sessionRepo: SessionRepository;

  constructor(app: FirebaseApp) {
    this.userRepo = new UserRepository(app);
    this.sessionRepo = new SessionRepository(app);
  }

  /**
   * Registers a new user or logs in an existing one based on Telegram ID.
   * Prevents duplicate registration.
   */
  async registerOrLogin(
    from: TelegramUser,
    api: Api<RawApi>,
    botToken: string,
  ): Promise<RegisterResult> {
    const existing = await this.userRepo.findByTelegramId(from.id);

    if (existing) {
      await this.sessionRepo.upsert(from.id);
      logger.info("User login", {
        telegramId: from.id,
        username: from.username,
      });
      return { user: existing, isNew: false };
    }

    const photoUrl = await this.fetchProfilePhotoUrl(from.id, api, botToken);

    const user = await this.userRepo.create({
      telegramId: from.id,
      username: from.username ?? null,
      firstName: from.first_name,
      lastName: from.last_name ?? null,
      photoUrl,
    });

    await this.sessionRepo.upsert(from.id);

    logger.info("User registered", {
      telegramId: from.id,
      username: from.username,
      name: user.name,
    });

    return { user, isNew: true };
  }

  private async fetchProfilePhotoUrl(
    telegramId: number,
    api: Api<RawApi>,
    botToken: string,
  ): Promise<string | null> {
    try {
      const photos = await api.getUserProfilePhotos(telegramId, { limit: 1 });
      const firstPhoto = photos.photos[0]?.[0];
      if (!firstPhoto) return null;

      const file = await api.getFile(firstPhoto.file_id);
      if (!file.file_path) return null;

      return `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
    } catch {
      logger.warn("Could not fetch profile photo", { telegramId });
      return null;
    }
  }
}
