import type { FirebaseApp } from "../config/firebase";
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../models/Category";
import { logger } from "../core/logger";

const COLLECTION = "categories";

export class CategoryRepository {
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  private col() {
    return this.db.collection(COLLECTION);
  }

  /** Retrieve all categories ordered by displayOrder. */
  async findAll(): Promise<Category[]> {
    const snap = await this.col().orderBy("displayOrder", "asc").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
  }

  /** Retrieve only active categories with submitEnabled, ordered by displayOrder. */
  async findActive(): Promise<Category[]> {
    const snap = await this.col()
      .where("status", "==", "active")
      .where("submitEnabled", "==", true)
      .orderBy("displayOrder", "asc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
  }

  /** Find a single category by Firestore document ID. */
  async findById(id: string): Promise<Category | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as Category;
  }

  /** Create a new category and return the saved document. */
  async create(input: CreateCategoryInput): Promise<Category> {
    const now = new Date().toISOString();
    const data = { ...input, createdAt: now, updatedAt: now };
    const ref = await this.col().add(data as unknown as Record<string, unknown>);
    logger.info("Category created", { id: ref.id, name: input.name });
    return { id: ref.id, ...data };
  }

  /** Update fields on an existing category. */
  async update(id: string, input: UpdateCategoryInput): Promise<void> {
    await this.col()
      .doc(id)
      .update({
        ...(input as Record<string, unknown>),
        updatedAt: new Date().toISOString(),
      });
    logger.info("Category updated", { id });
  }

  /** Hard-delete a category document. */
  async delete(id: string): Promise<void> {
    await this.col().doc(id).delete();
    logger.info("Category deleted", { id });
  }
}
