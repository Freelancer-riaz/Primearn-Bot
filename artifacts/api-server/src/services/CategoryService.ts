import type { FirebaseApp } from "../config/firebase";
import { CategoryRepository } from "../repositories/CategoryRepository";
import {
  CATEGORY_DEFAULTS,
  type Category,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "../models/Category";
import { NotFoundError } from "../core/errors/AppError";
import { logger } from "../core/logger";

export class CategoryService {
  private repo: CategoryRepository;

  constructor(app: FirebaseApp) {
    this.repo = new CategoryRepository(app);
  }

  /** Get all categories (for admin use). */
  async getAll(): Promise<Category[]> {
    return this.repo.findAll();
  }

  /** Get active + submit-enabled categories (for user-facing views). */
  async getActive(): Promise<Category[]> {
    return this.repo.findActive();
  }

  /** Get a category by ID. Throws NotFoundError if missing. */
  async getById(id: string): Promise<Category> {
    const category = await this.repo.findById(id);
    if (!category) throw new NotFoundError(`Category not found: ${id}`);
    return category;
  }

  /** Create a new category with merged defaults. */
  async create(input: Partial<CreateCategoryInput> & { name: string; description: string }): Promise<Category> {
    const payload: CreateCategoryInput = {
      ...CATEGORY_DEFAULTS,
      ...input,
    };
    logger.info("Creating category", { name: payload.name });
    return this.repo.create(payload);
  }

  /** Update an existing category. Throws NotFoundError if missing. */
  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    await this.getById(id); // ensures it exists
    await this.repo.update(id, input);
    return this.getById(id);
  }

  /** Toggle status between active ↔ inactive. */
  async toggleStatus(id: string): Promise<Category> {
    const category = await this.getById(id);
    const newStatus = category.status === "active" ? "inactive" : "active";
    await this.repo.update(id, { status: newStatus });
    logger.info("Category status toggled", { id, status: newStatus });
    return this.getById(id);
  }

  /** Toggle submit on ↔ off. */
  async toggleSubmit(id: string): Promise<Category> {
    const category = await this.getById(id);
    await this.repo.update(id, { submitEnabled: !category.submitEnabled });
    logger.info("Category submit toggled", {
      id,
      submitEnabled: !category.submitEnabled,
    });
    return this.getById(id);
  }

  /** Toggle daily limit on ↔ off. */
  async toggleDailyLimit(id: string): Promise<Category> {
    const category = await this.getById(id);
    await this.repo.update(id, { dailyLimitEnabled: !category.dailyLimitEnabled });
    return this.getById(id);
  }

  /** Toggle duplicate check on ↔ off. */
  async toggleDuplicateCheck(id: string): Promise<Category> {
    const category = await this.getById(id);
    await this.repo.update(id, { duplicateCheck: !category.duplicateCheck });
    return this.getById(id);
  }

  /** Toggle recheck on ↔ off. */
  async toggleRecheck(id: string): Promise<Category> {
    const category = await this.getById(id);
    await this.repo.update(id, { recheckEnabled: !category.recheckEnabled });
    return this.getById(id);
  }

  /** Delete a category. Throws NotFoundError if missing. */
  async delete(id: string): Promise<void> {
    await this.getById(id); // ensures it exists
    await this.repo.delete(id);
  }
}
