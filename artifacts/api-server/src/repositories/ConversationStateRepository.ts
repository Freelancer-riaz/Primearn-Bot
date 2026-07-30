import type { FirebaseApp } from "../config/firebase";
import type {
  ConversationData,
  VersionedState,
  VersionedStateStorage,
} from "@grammyjs/conversations";
import type { SubmissionConversationState } from "../models/SubmissionConversation";

const CONVERSATION_COLLECTION = "conversation_states";
const SUBMISSION_FLOW_COLLECTION = "submission_conversation_states";

export class ConversationStateRepository
  implements VersionedStateStorage<string, ConversationData>
{
  private db: FirebaseApp;

  constructor(app: FirebaseApp) {
    this.db = app;
  }

  // ── VersionedStateStorage implementation (grammY conversations) ────────────

  async read(
    chatId: string,
  ): Promise<VersionedState<ConversationData> | undefined> {
    const snap = await this.db
      .collection(CONVERSATION_COLLECTION)
      .doc(chatId)
      .get();
    console.log("CONVERSATION_STATE_READ", { chatId, exists: snap.exists });
    if (!snap.exists) return undefined;
    const data = snap.data() as {
      stateJson?: string;
      state?: VersionedState<ConversationData>;
    };
    if (data.stateJson !== undefined) {
      return JSON.parse(data.stateJson) as VersionedState<ConversationData>;
    }
    return data.state;
  }

  async write(
    chatId: string,
    state: VersionedState<ConversationData>,
  ): Promise<void> {
    const stateJson = JSON.stringify(state);
    console.log("CONVERSATION_STATE_WRITTEN", { chatId, version: state.version });
    await this.db
      .collection(CONVERSATION_COLLECTION)
      .doc(chatId)
      .set({ stateJson, updatedAt: new Date().toISOString() });
  }

  async delete(chatId: string): Promise<void> {
    console.log("CONVERSATION_STATE_DELETED", { chatId });
    await this.db.collection(CONVERSATION_COLLECTION).doc(chatId).delete();
  }

  // ── Submission draft state ─────────────────────────────────────────────────

  async getSubmissionFlow(
    chatId: number,
  ): Promise<SubmissionConversationState | null> {
    const snap = await this.db
      .collection(SUBMISSION_FLOW_COLLECTION)
      .doc(String(chatId))
      .get();
    return snap.exists ? (snap.data() as unknown as SubmissionConversationState) : null;
  }

  async saveSubmissionFlow(
    state: SubmissionConversationState,
  ): Promise<void> {
    await this.db
      .collection(SUBMISSION_FLOW_COLLECTION)
      .doc(String(state.chatId))
      .set(state as unknown as Record<string, unknown>);
  }

  async deleteSubmissionFlow(chatId: number): Promise<void> {
    await this.db
      .collection(SUBMISSION_FLOW_COLLECTION)
      .doc(String(chatId))
      .delete();
  }
}
