import type { FirebaseApp } from "../config/firebase";
import type { User, CreateUserInput } from "../models/User";
import { logger } from "../core/logger";

const COLLECTION = "users";

export class UserRepository {
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  async findByTelegramId(telegramId: number): Promise<User | null> {
    const snap = await this.db
      .collection(COLLECTION)
      .doc(String(telegramId))
      .get();
    if (!snap.exists) return null;
    return snap.data() as unknown as User;
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const nameParts = [input.firstName, input.lastName].filter(Boolean);

    const user: User = {
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      name: nameParts.join(" "),
      photoUrl: input.photoUrl,
      joinDate: now,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await this.db
      .collection(COLLECTION)
      .doc(String(input.telegramId))
      .set(user as unknown as Record<string, unknown>);

    logger.info("User created", {
      telegramId: input.telegramId,
      username: input.username,
    });

    return user;
  }

  async update(telegramId: number, data: Partial<User>): Promise<void> {
    await this.db
      .collection(COLLECTION)
      .doc(String(telegramId))
      .update({
        ...(data as Record<string, unknown>),
        updatedAt: new Date().toISOString(),
      });
  }
}
