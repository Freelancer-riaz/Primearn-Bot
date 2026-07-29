import type { FirebaseApp } from "../config/firebase";
import type { Category } from "../models/Category";
import { SubmissionRepository } from "../repositories/SubmissionRepository";
import { CategoryService } from "./CategoryService";

export interface SubmissionCategoryAvailability {
  available: boolean;
  reason?: string;
}

export class SubmissionFlowService {
  private categoryService: CategoryService;
  private submissionRepository: SubmissionRepository;

  constructor(app: FirebaseApp) {
    this.categoryService = new CategoryService(app);
    this.submissionRepository = new SubmissionRepository(app);
  }

  async getSelectableCategories(): Promise<Category[]> {
    const categories = await this.categoryService.getAll();
    return categories
      .filter((category) => this.checkCategory(category).available)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getCategory(id: string): Promise<Category | null> {
    const category = await this.submissionRepository.findCategoryById(id);
    if (!category) return null;
    return this.checkCategory(category).available ? category : null;
  }

  async getRecheckSource(
    telegramId: number,
    categoryId: string,
  ) {
    return this.submissionRepository.findRecheckSource(
      telegramId,
      categoryId,
    );
  }

  checkCategory(category: Category): SubmissionCategoryAvailability {
    if (category.status !== "active") {
      return { available: false, reason: "This category is inactive." };
    }
    if (!category.submitEnabled) {
      return { available: false, reason: "Submissions are closed for this category." };
    }

    const start = this.toMinutes(category.submitStartTime);
    const end = this.toMinutes(category.submitEndTime);
    if (start === null || end === null) {
      return { available: false, reason: "This category has an invalid submission schedule." };
    }

    const now = new Date();
    const current = now.getUTCHours() * 60 + now.getUTCMinutes();
    const inWindow =
      start <= end
        ? current >= start && current <= end
        : current >= start || current <= end;

    return inWindow
      ? { available: true }
      : {
          available: false,
          reason: `Submissions are open ${category.submitStartTime}–${category.submitEndTime} UTC.`,
        };
  }

  private toMinutes(value: string): number | null {
    if (!/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    if (
      hours === undefined ||
      minutes === undefined ||
      hours > 23 ||
      minutes > 59
    ) {
      return null;
    }
    return hours * 60 + minutes;
  }
}