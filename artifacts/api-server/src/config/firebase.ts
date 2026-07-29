/**
 * Firebase / Firestore configuration.
 *
 * Replaces firebase-admin with a lightweight Firestore REST API client that
 * runs natively on Cloudflare Workers (no dynamic code generation).
 *
 * Public surface is intentionally identical to the previous firebase-admin
 * version so all callers continue to compile without changes:
 *   - initFirebase(env) — returns the FirestoreDB singleton
 *   - getDb(env)        — convenience alias
 *   - FirebaseApp       — type alias for FirestoreDB (backwards-compat export)
 */

import { FirestoreDB } from "../lib/firestore/client";
import type { ServiceAccount } from "../lib/firestore/auth";
import type { Env } from "./env";

export type { FirestoreDB as FirebaseApp };

let _db: FirestoreDB | null = null;

function parseServiceAccount(env: Env): ServiceAccount {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  // Cloudflare Workers may auto-parse JSON secrets into an object
  if (typeof raw === "object" && raw !== null) {
    return raw as unknown as ServiceAccount;
  }
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch (e) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${String(e)}`,
    );
  }
}

/**
 * Returns (or creates) the FirestoreDB singleton.
 * Safe to call on every request — initialises only once per worker lifetime.
 */
export function initFirebase(env: Env): FirestoreDB {
  if (_db) return _db;
  _db = new FirestoreDB(parseServiceAccount(env));
  return _db;
}

/**
 * Convenience alias — returns the Firestore instance for the given env.
 */
export function getDb(env: Env): FirestoreDB {
  return initFirebase(env);
}
