/**
 * SubmittedId — one document per unique (categoryId, uid) pair.
 *
 * Collection: submitted_ids
 * Document ID: "{categoryId}_{uid}"
 *
 * This collection is the master index for Old ID detection.
 * Google Sheets is NOT consulted for this purpose.
 */
export interface SubmittedId {
  /** The raw ID value (e.g. a Facebook UID). */
  uid: string;
  /** Category the ID was submitted under. */
  categoryId: string;
  /** The submission document that first recorded this ID. */
  submissionId: string;
  /** Telegram user ID (as string) who submitted this ID. */
  submittedBy: string;
  /** ISO 8601 timestamp of when this ID was first indexed. */
  submittedAt: string;
  /** Always "active" for now; reserved for future soft-delete. */
  status: "active";
}

/** Composite document key used to look up and write submitted IDs. */
export function submittedIdDocKey(categoryId: string, uid: string): string {
  // Use a separator that cannot appear in either component.
  return `${categoryId}_${uid}`;
}
