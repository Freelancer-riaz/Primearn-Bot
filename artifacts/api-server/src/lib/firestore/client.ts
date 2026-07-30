/**
 * Minimal Firestore REST API client for Cloudflare Workers.
 *
 * Exposes a fluent interface deliberately compatible with firebase-admin's
 * Firestore SDK so repository classes need only trivial import changes — no
 * query or data-access logic has to move.
 *
 * Only uses fetch + Web Crypto; no Node.js built-ins or dynamic eval.
 */

import type { ServiceAccount } from "./auth";
import { getAccessToken } from "./auth";
import {
  toDocument,
  fromDocument,
  toValue,
  docIdFromName,
  type FirestoreDocument,
  type FirestoreValue,
} from "./serialize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhereFilterOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

interface FieldFilter {
  field: string;
  op: WhereFilterOp;
  value: unknown;
}

interface OrderByClause {
  field: string;
  direction: "ASCENDING" | "DESCENDING";
}

// ---------------------------------------------------------------------------
// Snapshot classes
// ---------------------------------------------------------------------------

export class DocumentSnapshot {
  readonly exists: boolean;
  readonly id: string;
  private readonly _data: Record<string, unknown> | undefined;

  constructor(
    id: string,
    exists: boolean,
    data: Record<string, unknown> | undefined,
  ) {
    this.id = id;
    this.exists = exists;
    this._data = data;
  }

  data(): Record<string, unknown> | undefined {
    return this._data;
  }
}

export class QueryDocumentSnapshot {
  readonly exists = true as const;
  readonly id: string;
  private readonly _data: Record<string, unknown>;

  constructor(id: string, data: Record<string, unknown>) {
    this.id = id;
    this._data = data;
  }

  data(): Record<string, unknown> {
    return this._data;
  }
}

export class QuerySnapshot {
  readonly docs: QueryDocumentSnapshot[];

  constructor(docs: QueryDocumentSnapshot[]) {
    this.docs = docs;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

export class Query {
  constructor(
    protected readonly _db: FirestoreDB,
    protected readonly _collection: string,
    protected readonly _filters: FieldFilter[],
    protected readonly _orderBy: OrderByClause[],
    protected readonly _limit: number | undefined,
  ) {}

  where(field: string, op: WhereFilterOp, value: unknown): Query {
    return new Query(
      this._db,
      this._collection,
      [...this._filters, { field, op, value }],
      this._orderBy,
      this._limit,
    );
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query {
    return new Query(
      this._db,
      this._collection,
      this._filters,
      [
        ...this._orderBy,
        {
          field,
          direction: direction === "asc" ? "ASCENDING" : "DESCENDING",
        },
      ],
      this._limit,
    );
  }

  limit(count: number): Query {
    return new Query(
      this._db,
      this._collection,
      this._filters,
      this._orderBy,
      count,
    );
  }

  async get(): Promise<QuerySnapshot> {
    return this._db._runQuery(
      this._collection,
      this._filters,
      this._orderBy,
      this._limit,
    );
  }
}

// ---------------------------------------------------------------------------
// Collection / Document reference classes
// ---------------------------------------------------------------------------

export class DocumentRef {
  constructor(
    private readonly _db: FirestoreDB,
    private readonly _collection: string,
    private readonly _id: string,
  ) {}

  async get(): Promise<DocumentSnapshot> {
    return this._db._getDoc(this._collection, this._id);
  }

  async set(data: Record<string, unknown>): Promise<void> {
    return this._db._patchDoc(this._collection, this._id, data);
  }

  async update(data: Record<string, unknown>): Promise<void> {
    // Partial update — same PATCH mechanism, mask covers only provided keys
    return this._db._patchDoc(this._collection, this._id, data);
  }

  async delete(): Promise<void> {
    return this._db._deleteDoc(this._collection, this._id);
  }
}

export class CollectionRef {
  constructor(
    private readonly _db: FirestoreDB,
    private readonly _name: string,
  ) {}

  doc(id: string): DocumentRef {
    return new DocumentRef(this._db, this._name, id);
  }

  async add(data: Record<string, unknown>): Promise<{ id: string }> {
    return this._db._addDoc(this._name, data);
  }

  where(field: string, op: WhereFilterOp, value: unknown): Query {
    return new Query(this._db, this._name, [{ field, op, value }], [], undefined);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query {
    return new Query(this._db, this._name, [], [
      {
        field,
        direction: direction === "asc" ? "ASCENDING" : "DESCENDING",
      },
    ], undefined);
  }
}

// ---------------------------------------------------------------------------
// Main FirestoreDB class
// ---------------------------------------------------------------------------

export class FirestoreDB {
  private readonly _sa: ServiceAccount;
  private readonly _base: string;

  constructor(sa: ServiceAccount) {
    this._sa = sa;
    this._base =
      `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  }

  collection(name: string): CollectionRef {
    return new CollectionRef(this, name);
  }

  // ── Internal methods called by ref/query classes ──────────────────────────

  private async _authHeaders(): Promise<Record<string, string>> {
    const token = await getAccessToken(this._sa);
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async _getDoc(collection: string, id: string): Promise<DocumentSnapshot> {
    const res = await fetch(`${this._base}/${collection}/${encodeURIComponent(id)}`, {
      headers: await this._authHeaders(),
    });

    if (res.status === 404) return new DocumentSnapshot(id, false, undefined);
    if (!res.ok) {
      throw new Error(`Firestore GET /${collection}/${id} failed ${res.status}: ${await res.text()}`);
    }

    const doc = (await res.json()) as FirestoreDocument;
    return new DocumentSnapshot(id, true, fromDocument(doc));
  }

  async _patchDoc(
    collection: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Build field mask from non-undefined keys only
    const fieldPaths = Object.keys(data).filter((k) => data[k] !== undefined);
    const qs = fieldPaths
      .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
      .join("&");

    const url =
      `${this._base}/${collection}/${encodeURIComponent(id)}` +
      (fieldPaths.length ? `?${qs}` : "");

    const res = await fetch(url, {
      method: "PATCH",
      headers: await this._authHeaders(),
      body: JSON.stringify(toDocument(data)),
    });

    if (!res.ok) {
      throw new Error(`Firestore PATCH /${collection}/${id} failed ${res.status}: ${await res.text()}`);
    }
  }

  async _deleteDoc(collection: string, id: string): Promise<void> {
    const res = await fetch(
      `${this._base}/${collection}/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: await this._authHeaders() },
    );

    if (!res.ok) {
      throw new Error(`Firestore DELETE /${collection}/${id} failed ${res.status}: ${await res.text()}`);
    }
  }

  async _addDoc(
    collection: string,
    data: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const res = await fetch(`${this._base}/${collection}`, {
      method: "POST",
      headers: await this._authHeaders(),
      body: JSON.stringify(toDocument(data)),
    });

    if (!res.ok) {
      throw new Error(`Firestore POST /${collection} failed ${res.status}: ${await res.text()}`);
    }

    const doc = (await res.json()) as FirestoreDocument;
    return { id: docIdFromName(doc.name ?? "") };
  }

  /**
   * Returns the Firestore resource-name prefix (without the REST base URL).
   * Used to build fully-qualified document names for batch operations.
   * e.g. "projects/my-project/databases/(default)/documents"
   */
  private get _baseName(): string {
    return this._base.replace("https://firestore.googleapis.com/v1/", "");
  }

  /**
   * Checks existence for many documents in a single batchGet request (or a
   * small number of chunks when the list exceeds CHUNK_SIZE).
   *
   * Returns a Set of document IDs that exist in Firestore.
   * Uses at most ⌈ids.length / CHUNK_SIZE⌉ subrequests instead of N.
   */
  async batchGetExists(
    collection: string,
    docIds: string[],
  ): Promise<Set<string>> {
    if (docIds.length === 0) return new Set();

    const CHUNK = 100; // conservative; batchGet has no documented hard limit
    const existingIds = new Set<string>();
    const headers = await this._authHeaders();
    const baseName = this._baseName;

    for (let i = 0; i < docIds.length; i += CHUNK) {
      const chunk = docIds.slice(i, i + CHUNK);
      const documents = chunk.map(
        (id) => `${baseName}/${collection}/${encodeURIComponent(id)}`,
      );

      const res = await fetch(`${this._base}:batchGet`, {
        method: "POST",
        headers,
        body: JSON.stringify({ documents }),
      });

      if (!res.ok) {
        throw new Error(
          `Firestore batchGet on ${collection} failed ${res.status}: ${await res.text()}`,
        );
      }

      const results = (await res.json()) as Array<{
        found?: FirestoreDocument;
        missing?: string;
      }>;

      for (const result of results) {
        if (result.found?.name) {
          existingIds.add(docIdFromName(result.found.name));
        }
      }
    }

    return existingIds;
  }

  /**
   * Upserts many documents in batched commit requests.
   * Uses at most ⌈docs.length / 500⌉ subrequests (Firestore commit limit).
   */
  async batchSetDocs(
    collection: string,
    docs: Array<{ id: string; data: Record<string, unknown> }>,
  ): Promise<void> {
    if (docs.length === 0) return;

    const CHUNK = 500; // Firestore commit limit
    const headers = await this._authHeaders();
    const baseName = this._baseName;

    for (let i = 0; i < docs.length; i += CHUNK) {
      const chunk = docs.slice(i, i + CHUNK);
      const writes = chunk.map(({ id, data }) => ({
        update: {
          name: `${baseName}/${collection}/${encodeURIComponent(id)}`,
          ...toDocument(data),
        },
      }));

      const res = await fetch(`${this._base}:commit`, {
        method: "POST",
        headers,
        body: JSON.stringify({ writes }),
      });

      if (!res.ok) {
        throw new Error(
          `Firestore commit on ${collection} failed ${res.status}: ${await res.text()}`,
        );
      }
    }
  }

  async _runQuery(
    collection: string,
    filters: FieldFilter[],
    orderBy: OrderByClause[],
    limit: number | undefined,
  ): Promise<QuerySnapshot> {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: collection }],
    };

    // Build where clause
    if (filters.length === 1) {
      structuredQuery.where = toFieldFilter(filters[0]!);
    } else if (filters.length > 1) {
      structuredQuery.where = {
        compositeFilter: {
          op: "AND",
          filters: filters.map(toFieldFilter),
        },
      };
    }

    if (orderBy.length > 0) {
      structuredQuery.orderBy = orderBy.map((o) => ({
        field: { fieldPath: o.field },
        direction: o.direction,
      }));
    }

    if (limit !== undefined) structuredQuery.limit = limit;

    const res = await fetch(`${this._base}:runQuery`, {
      method: "POST",
      headers: await this._authHeaders(),
      body: JSON.stringify({ structuredQuery }),
    });

    if (!res.ok) {
      throw new Error(`Firestore runQuery on ${collection} failed ${res.status}: ${await res.text()}`);
    }

    // Response is an array; entries without `document` are metadata rows
    const rows = (await res.json()) as Array<{
      document?: FirestoreDocument;
    }>;

    const docs = rows
      .filter((r): r is { document: FirestoreDocument } => r.document != null)
      .map((r) => {
        const id = docIdFromName(r.document.name ?? "");
        return new QueryDocumentSnapshot(id, fromDocument(r.document));
      });

    return new QuerySnapshot(docs);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function restOp(op: WhereFilterOp): string {
  const map: Record<WhereFilterOp, string> = {
    "==": "EQUAL",
    "!=": "NOT_EQUAL",
    "<": "LESS_THAN",
    "<=": "LESS_THAN_OR_EQUAL",
    ">": "GREATER_THAN",
    ">=": "GREATER_THAN_OR_EQUAL",
  };
  return map[op];
}

function toFieldFilter(f: FieldFilter): {
  fieldFilter: {
    field: { fieldPath: string };
    op: string;
    value: FirestoreValue;
  };
} {
  return {
    fieldFilter: {
      field: { fieldPath: f.field },
      op: restOp(f.op),
      value: toValue(f.value),
    },
  };
}
