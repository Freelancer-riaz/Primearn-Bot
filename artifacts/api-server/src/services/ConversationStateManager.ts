import type { FirebaseApp } from "../config/firebase";
import { ConversationStateRepository } from "../repositories/ConversationStateRepository";
import type {
  SubmissionConversationState,
  SubmissionFileDraft,
  SubmissionFlowStatus,
} from "../models/SubmissionConversation";

export class ConversationStateManager {
  private repository: ConversationStateRepository;

  constructor(app: FirebaseApp) {
    this.repository = new ConversationStateRepository(app);
  }

  getStorage() {
    return this.repository;
  }

  async saveSubmissionFlow(
    state: SubmissionConversationState,
  ): Promise<void> {
    await this.repository.saveSubmissionFlow({
      ...state,
      updatedAt: new Date().toISOString(),
    });
  }

  async startSubmissionFlow(
    telegramId: number,
    chatId: number,
  ): Promise<SubmissionConversationState> {
    const now = new Date().toISOString();
    const state: SubmissionConversationState = {
      telegramId,
      chatId,
      status: "started",
      categoryId: null,
      categoryName: null,
      submissionType: null,
      sourceSubmissionId: null,
      dailyLimitEnabled: null,
      duplicateCheckEnabled: null,
      file: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveSubmissionFlow(state);
    return state;
  }

  async updateSubmissionFlow(
    chatId: number,
    update: Partial<
      Pick<
        SubmissionConversationState,
        | "categoryId"
        | "categoryName"
        | "submissionType"
        | "sourceSubmissionId"
        | "dailyLimitEnabled"
        | "duplicateCheckEnabled"
        | "file"
        | "status"
      >
    >,
  ): Promise<void> {
    const current = await this.repository.getSubmissionFlow(chatId);
    if (!current) return;
    await this.saveSubmissionFlow({ ...current, ...update });
  }

  async setCategory(
    chatId: number,
    category: {
      id: string;
      name: string;
      dailyLimitEnabled: boolean;
      duplicateCheck: boolean;
    },
  ): Promise<void> {
    await this.updateSubmissionFlow(chatId, {
      status: "category_selected",
      categoryId: category.id,
      categoryName: category.name,
      dailyLimitEnabled: category.dailyLimitEnabled,
      duplicateCheckEnabled: category.duplicateCheck,
    });
  }

  async setType(
    chatId: number,
    submissionType: "normal" | "recheck",
    sourceSubmissionId: string | null,
  ): Promise<void> {
    await this.updateSubmissionFlow(chatId, {
      status: "type_selected",
      submissionType,
      sourceSubmissionId,
    });
  }

  async setFile(
    chatId: number,
    file: SubmissionFileDraft,
  ): Promise<void> {
    await this.updateSubmissionFlow(chatId, {
      status: "file_received",
      file,
    });
  }

  async complete(chatId: number): Promise<void> {
    await this.updateSubmissionFlow(chatId, { status: "completed" });
  }
}