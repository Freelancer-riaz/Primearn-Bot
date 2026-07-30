export type CategoryStatus = "active" | "inactive";

export interface SheetConfig {
  sheetId: string;
  worksheetName: string;
  columns: string[];
}

export interface Category {
  id: string; // Firestore document ID
  name: string;
  description: string;
  pricePerGoodId: number;
  status: CategoryStatus;

  // Google Sheets configuration (optional — set by admin)
  sheetConfig?: SheetConfig;

  // Submit control
  submitEnabled: boolean;
  dailyLimitEnabled: boolean;
  dailySubmitCount: number;
  submitStartTime: string; // "HH:MM" 24-hour format
  submitEndTime: string; // "HH:MM" 24-hour format
  countdownSupport: boolean;

  // Validation
  duplicateCheck: boolean;
  recheckEnabled: boolean;
  minIds: number;
  maxIds: number;

  // Display
  displayOrder: number;

  // Timestamps
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Used when creating a new category (id + timestamps are auto-generated). */
export type CreateCategoryInput = Omit<Category, "id" | "createdAt" | "updatedAt">;

/** All fields are optional when updating. */
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

/** Default values for a new category. */
export const CATEGORY_DEFAULTS: Omit<
  Category,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
> = {
  pricePerGoodId: 0,
  status: "inactive",
  submitEnabled: false,
  dailyLimitEnabled: false,
  dailySubmitCount: 0,
  submitStartTime: "00:00",
  submitEndTime: "23:59",
  countdownSupport: false,
  duplicateCheck: true,
  recheckEnabled: false,
  minIds: 1,
  maxIds: 100,
  displayOrder: 0,
};
