/**
 * Firestore REST API value serialisation / deserialisation.
 *
 * Converts between plain JavaScript values and the Firestore REST typed-value
 * format, e.g. { stringValue: "hello" } or { integerValue: "42" }.
 */

// ---------------------------------------------------------------------------
// Firestore REST value types
// ---------------------------------------------------------------------------

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string } // REST API encodes integers as strings
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

export interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

// ---------------------------------------------------------------------------
// JS → Firestore
// ---------------------------------------------------------------------------

export function toValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val)
      ? { integerValue: String(val) }
      : { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toValue) } };
  }
  if (typeof val === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) fields[k] = toValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/**
 * Converts a plain JS object to a Firestore document body.
 * Skips undefined values (mirrors firebase-admin behaviour).
 */
export function toDocument(
  data: Record<string, unknown>,
): { fields: Record<string, FirestoreValue> } {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) fields[k] = toValue(v);
  }
  return { fields };
}

// ---------------------------------------------------------------------------
// Firestore → JS
// ---------------------------------------------------------------------------

export function fromValue(val: FirestoreValue): unknown {
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("stringValue" in val) return val.stringValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    return (val.arrayValue.values ?? []).map(fromValue);
  }
  if ("mapValue" in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = fromValue(v);
    }
    return out;
  }
  return null;
}

/** Converts a Firestore REST document to a plain JS object. */
export function fromDocument(
  doc: FirestoreDocument,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    out[k] = fromValue(v);
  }
  return out;
}

/** Extracts the document ID from a Firestore resource name. */
export function docIdFromName(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}
