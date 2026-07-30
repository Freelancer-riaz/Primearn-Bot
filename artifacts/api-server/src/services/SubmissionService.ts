import type { FirebaseApp } from "../config/firebase";
import { SubmissionRepository } from "../repositories/SubmissionRepository";
import { SubmittedIdRepository } from "../repositories/SubmittedIdRepository";
import type {
  Submission,
  SubmissionType,
  UpdateSubmissionInput,
} from "../models/Submission";
import type { Category } from "../models/Category";
import { ValidationError, NotFoundError } from "../core/errors/AppError";
import { logger } from "../core/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateSubmissionRequest {
  telegramId: number;
  categoryId: string;
  categoryName: string;
  submissionType: SubmissionType;
  fileName: string;
  fileUrl: string;
  /** Total rows in Column A of the uploaded file. */
  totalIds: number;
  /** Duplicates detected within the uploaded file (Column A). */
  duplicateIds: number;
  /**
   * Deduplicated list of valid IDs parsed from the file.
   * When provided, each ID is checked against submitted_ids for Old ID
   * Detection. When omitted (e.g. parsing not yet implemented), old ID
   * detection is skipped and oldIds defaults to 0.
   */
  idList?: string[];
  /** sourceSubmissionId is required when submissionType === "recheck". */
  sourceSubmissionId?: string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SubmissionService {
  private repo: SubmissionRepository;
  private submittedIdRepo: SubmittedIdRepository;

  constructor(app: FirebaseApp) {
    this.repo = new SubmissionRepository(app);
    this.submittedIdRepo = new SubmittedIdRepository(app);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Validate all business rules, then persist the submission. */
  async validateAndCreate(
    req: CreateSubmissionRequest,
    category: Category,
  ): Promise<Submission> {
    this.validateRequest(req, category);
    this.validateSubmitEnabled(category);
    this.validateRecheckEnabled(req.submissionType, category);
    this.validateSubmitTimeWindow(category);

    // ── Old ID Detection ────────────────────────────────────────────────────
    // When the caller supplies idList (deduplicated, valid IDs from the file),
    // check each one against submitted_ids. IDs already present are "old" and
    // are excluded from the submission. IDs that pass become genuinely new.
    let oldIdCount = 0;
    let newIdList: string[] | undefined;

    logger.info("[DEBUG 1] Parser IDs", {
      parserIds: req.idList?.length ?? 0,
    });

    if (req.idList && req.idList.length > 0) {
      const separated = await this.submittedIdRepo.separateOldIds(
        req.idList,
        req.categoryId,
      );
      oldIdCount = separated.oldIds.length;
      newIdList = separated.newIds;
      logger.info("[DEBUG 2] Old ID Result", {
        oldIds: separated.oldIds.length,
        newIds: separated.newIds.length,
      });
    }

    // validIds = unique file IDs that are neither intra-file duplicates nor old
    const validIds = Math.max(
      0,
      req.totalIds - req.duplicateIds - oldIdCount,
    );
    logger.info("[DEBUG 3] Validation Input", {
      validIds,
      minimumRequired: category.minIds,
    });
    this.validateIdCount(validIds, category);

    const today = this.todayUTC();

    if (req.submissionType === "normal") {
      await this.validateDailyLimit(req.telegramId, category);
    } else {
      await this.validateRecheckReference(
        req.sourceSubmissionId,
        req.telegramId,
        req.categoryId,
      );
    }

    logger.info("Creating submission", {
      telegramId: req.telegramId,
      categoryId: req.categoryId,
      type: req.submissionType,
      totalIds: req.totalIds,
      duplicateIds: req.duplicateIds,
      oldIds: oldIdCount,
      validIds,
    });

    const submission = await this.repo.create({
      userId: String(req.telegramId),
      telegramId: req.telegramId,
      categoryId: req.categoryId,
      categoryName: category.name,
      submissionType: req.submissionType,
      fileName: req.fileName,
      fileUrl: req.fileUrl,
      totalIds: req.totalIds,
      duplicateIds: req.duplicateIds,
      oldIds: oldIdCount,
      validIds,
      submitDate: today,
      submitTime: this.currentTimeUTC(),
      status: "pending",
      reportStatus: "pending",
      recheckEligible: false,
      recheckUsed: false,
      sourceSubmissionId: req.sourceSubmissionId ?? null,
      adminNotes: null,
    });

    // ── Index new IDs ───────────────────────────────────────────────────────
    // Only genuinely new IDs are saved. Old IDs and intra-file duplicates
    // are never written to submitted_ids.
    if (newIdList && newIdList.length > 0) {
      await this.submittedIdRepo.saveIds(
        newIdList,
        req.categoryId,
        submission.id,
        req.telegramId,
      );
    }

    return submission;
  }

  /** Get a submission by ID. Throws NotFoundError if missing. */
  async getById(id: string): Promise<Submission> {
    const sub = await this.repo.findById(id);
    if (!sub) throw new NotFoundError(`Submission not found: ${id}`);
    return sub;
  }

  /** Get all submissions for a user. */
  async getByUser(telegramId: number): Promise<Submission[]> {
    return this.repo.findByUser(telegramId);
  }

  /** Update mutable admin / status fields. */
  async update(id: string, input: UpdateSubmissionInput): Promise<Submission> {
    await this.getById(id); // ensures it exists
    await this.repo.update(id, input);
    return this.getById(id);
  }

  // ── Validation Helpers ─────────────────────────────────────────────────────

  /** Validate request values before applying category business rules. */
  private validateRequest(
    req: CreateSubmissionRequest,
    category: Category,
  ): void {
    if (!Number.isSafeInteger(req.telegramId) || req.telegramId <= 0) {
      throw new ValidationError("A valid Telegram ID is required.");
    }

    if (req.categoryId !== category.id) {
      throw new ValidationError("Submission category does not match.");
    }

    if (req.categoryName.trim() !== category.name.trim()) {
      throw new ValidationError("Submission category name does not match.");
    }

    if (!req.fileName.trim()) {
      throw new ValidationError("Submission file name is required.");
    }

    if (!req.fileUrl.trim()) {
      throw new ValidationError("Submission file URL is required.");
    }

    if (!Number.isSafeInteger(req.totalIds) || req.totalIds < 0) {
      throw new ValidationError("Total IDs must be a non-negative integer.");
    }

    if (
      !Number.isSafeInteger(req.duplicateIds) ||
      req.duplicateIds < 0 ||
      req.duplicateIds > req.totalIds
    ) {
      throw new ValidationError(
        "Duplicate IDs must be between zero and the total ID count.",
      );
    }

    if (req.submissionType !== "normal" && req.submissionType !== "recheck") {
      throw new ValidationError("Invalid submission type.");
    }

    if (req.submissionType === "normal" && req.sourceSubmissionId) {
      throw new ValidationError(
        "Normal submission cannot reference a source submission.",
      );
    }
  }

  /** Throws if the category has submission disabled. */
  private validateSubmitEnabled(category: Category): void {
    if (!category.submitEnabled) {
      throw new ValidationError(
        `Submissions are currently closed for "${category.name}".`,
      );
    }
    if (category.status !== "active") {
      throw new ValidationError(`Category "${category.name}" is not active.`);
    }
  }

  /**
   * Throws if current UTC time is outside the category's submit window.
   * Times are "HH:MM" in 24-hour format.
   */
  private validateSubmitTimeWindow(category: Category): void {
    const now = new Date();
    const currentMins = now.getUTCHours() * 60 + now.getUTCMinutes();

    const toMins = (t: string): number => {
      if (!/^\d{2}:\d{2}$/.test(t)) return Number.NaN;
      const [h, m] = t.split(":").map(Number);
      if (
        h === undefined ||
        m === undefined ||
        h < 0 ||
        h > 23 ||
        m < 0 ||
        m > 59
      ) {
        return Number.NaN;
      }
      return h * 60 + m;
    };

    const start = toMins(category.submitStartTime);
    const end = toMins(category.submitEndTime);

    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new ValidationError(
        `Invalid submission window for "${category.name}".`,
      );
    }

    const inWindow =
      start <= end
        ? currentMins >= start && currentMins <= end
        : currentMins >= start || currentMins <= end;

    if (!inWindow) {
      throw new ValidationError(
        `Submission window for "${category.name}" is ${category.submitStartTime}–${category.submitEndTime} UTC.`,
      );
    }
  }

  /**
   * Throws if validIds (total minus duplicates) falls outside the category's
   * configured upload ID range. Called after validIds is computed so only
   * genuine IDs count toward the limit.
   */
  private validateIdCount(validIds: number, category: Category): void {
    if (validIds < category.minIds) {
      throw new ValidationError(
        `❌ Minimum upload limit not reached.\n\nMinimum Required:\n${category.minIds} IDs\n\nYour File:\n${validIds} IDs`,
      );
    }
    if (validIds > category.maxIds) {
      throw new ValidationError(
        `❌ Maximum upload limit exceeded.\n\nMaximum Allowed:\n${category.maxIds} IDs\n\nYour File:\n${validIds} IDs`,
      );
    }
  }

  /**
   * Throws if the user has already reached the daily submission limit for this
   * category (Asia/Dhaka calendar day, resets at 00:00 Asia/Dhaka).
   *
   * Counted immediately on creation — does NOT wait for admin acceptance.
   * Any submission that reached Firestore counts. Only submissions that never
   * reached Firestore (failed validation, upload failures, cancellations) are
   * excluded naturally.
   *
   * If dailyLimitEnabled is false the check is skipped (unlimited submissions).
   */
  private async validateDailyLimit(
    telegramId: number,
    category: Category,
  ): Promise<void> {
    if (!category.dailyLimitEnabled) return;

    const { start, end } = this.dhakaDayBoundsUTC();
    const count = await this.repo.countCreatedSubmissionsToday(
      telegramId,
      category.id,
      start,
      end,
    );

    if (count >= category.dailySubmitCount) {
      throw new ValidationError(
        "Daily submission limit reached.\n\nYou have reached today's submission limit for this category.\n\nPlease try again tomorrow.",
      );
    }
  }

  /**
   * Throws if a recheck submission does not point to an existing submission
   * owned by the same user. Rechecks do not participate in the normal daily
   * submission check.
   */
  private async validateRecheckReference(
    sourceSubmissionId: string | null | undefined,
    telegramId: number,
    categoryId: string,
  ): Promise<void> {
    if (!sourceSubmissionId) {
      throw new ValidationError(
        "Recheck submission must reference a source submission ID.",
      );
    }

    const source = await this.repo.findById(sourceSubmissionId);
    if (!source) {
      throw new NotFoundError(
        `Source submission not found: ${sourceSubmissionId}`,
      );
    }

    if (source.telegramId !== telegramId) {
      throw new ValidationError(
        "Source submission does not belong to this user.",
      );
    }

    if (source.categoryId !== categoryId) {
      throw new ValidationError(
        "Source submission belongs to a different category.",
      );
    }

    if (source.submissionType !== "normal") {
      throw new ValidationError(
        "A recheck must reference an original normal submission.",
      );
    }
  }

  /** Throws if the category does not allow recheck submissions. */
  private validateRecheckEnabled(
    submissionType: SubmissionType,
    category: Category,
  ): void {
    if (submissionType === "recheck" && !category.recheckEnabled) {
      throw new ValidationError(
        `Rechecks are currently closed for "${category.name}".`,
      );
    }
  }

  // ── Time Utilities ─────────────────────────────────────────────────────────

  /** Returns today's date as "YYYY-MM-DD" in UTC. */
  private todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Returns current time as "HH:MM:SS" in UTC. */
  private currentTimeUTC(): string {
    return new Date().toISOString().slice(11, 19);
  }

  /**
   * Returns the UTC ISO boundaries of the current calendar day in Asia/Dhaka
   * (UTC+6, no DST).
   *
   * Example: if it is 2025-07-15 10:00 Dhaka (04:00 UTC)
   *   start → "2025-07-14T18:00:00.000Z"  (00:00 Dhaka in UTC)
   *   end   → "2025-07-15T18:00:00.000Z"  (00:00 next Dhaka day in UTC)
   */
  private dhakaDayBoundsUTC(): { start: string; end: string } {
    const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, no DST

    const nowUTC = Date.now();
    const nowDhaka = nowUTC + DHAKA_OFFSET_MS;

    // Build a Date whose UTC fields represent the Dhaka wall-clock time
    const d = new Date(nowDhaka);

    // Midnight of today in Dhaka, as a UTC ms value
    const midnightDhakaAsUTC = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      0,
      0,
      0,
      0,
    );

    // Convert back to true UTC by subtracting the offset
    const startUTC = midnightDhakaAsUTC - DHAKA_OFFSET_MS;
    const endUTC = startUTC + 24 * 60 * 60 * 1000;

    return {
      start: new Date(startUTC).toISOString(),
      end: new Date(endUTC).toISOString(),
    };
  }
}
