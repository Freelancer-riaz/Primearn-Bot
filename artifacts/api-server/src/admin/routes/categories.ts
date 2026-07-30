import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../../config/env";
import { CategoryService } from "../../services/CategoryService";
import { GoogleSheetsService } from "../../services/GoogleSheetsService";
import { NotFoundError, ValidationError } from "../../core/errors/AppError";
import { initFirebase } from "../../config/firebase";
import type { ServiceAccount } from "../../lib/firestore/auth";

const categoriesRouter = new Hono<{ Bindings: Env }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getService(env: Env): CategoryService {
  const app = initFirebase(env);
  return new CategoryService(app);
}

function parseServiceAccount(env: Env): ServiceAccount {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (typeof raw === "object" && raw !== null) {
    return raw as unknown as ServiceAccount;
  }
  return JSON.parse(raw) as ServiceAccount;
}

function handleError(c: Context<{ Bindings: Env }>, err: unknown): Response {
  if (err instanceof NotFoundError) {
    return c.json({ success: false, error: err.message }, 404);
  }
  if (err instanceof ValidationError) {
    return c.json({ success: false, error: err.message }, 400);
  }
  throw err; // let Hono's errorHandler deal with unexpected errors
}

// ── GET /admin/categories ─────────────────────────────────────────────────────

categoriesRouter.get("/", async (c) => {
  const service = getService(c.env);
  const categories = await service.getAll();
  return c.json({ success: true, data: categories });
});

// ── POST /admin/categories ────────────────────────────────────────────────────

categoriesRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ success: false, error: "Request body must be an object" }, 400);
  }

  const { name, description, ...rest } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim() === "") {
    return c.json({ success: false, error: "Field 'name' is required and must be a non-empty string" }, 400);
  }
  if (typeof description !== "string" || description.trim() === "") {
    return c.json({ success: false, error: "Field 'description' is required and must be a non-empty string" }, 400);
  }

  try {
    const service = getService(c.env);
    const category = await service.create({ name: name.trim(), description: description.trim(), ...rest });
    return c.json({ success: true, data: category }, 201);
  } catch (err) {
    return handleError(c, err);
  }
});

// ── GET /admin/categories/:id ─────────────────────────────────────────────────

categoriesRouter.get("/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const service = getService(c.env);
    const category = await service.getById(id);
    return c.json({ success: true, data: category });
  } catch (err) {
    return handleError(c, err);
  }
});

// ── PATCH /admin/categories/:id ───────────────────────────────────────────────

categoriesRouter.patch("/:id", async (c) => {
  const { id } = c.req.param();

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return c.json({ success: false, error: "Request body must be an object" }, 400);
  }

  // Strip id/timestamp fields — they must not be overwritten via the API
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...input } = body as Record<string, unknown>;

  if (Object.keys(input).length === 0) {
    return c.json({ success: false, error: "Request body must contain at least one field to update" }, 400);
  }

  try {
    const service = getService(c.env);
    const category = await service.update(id, input);
    return c.json({ success: true, data: category });
  } catch (err) {
    return handleError(c, err);
  }
});

// ── DELETE /admin/categories/:id ──────────────────────────────────────────────

categoriesRouter.delete("/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const service = getService(c.env);
    await service.delete(id);
    return c.json({ success: true, message: `Category '${id}' deleted` });
  } catch (err) {
    return handleError(c, err);
  }
});

// ── POST /admin/categories/:id/test-sheet-connection ─────────────────────────
//
// Verifies that the service account can access the given Google Sheet and that
// the named worksheet exists.  Read-only — no data is written or modified.

categoriesRouter.post("/:id/test-sheet-connection", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ success: false, error: "Request body must be an object" }, 400);
  }

  const { sheetId, worksheetName } = body as Record<string, unknown>;

  if (typeof sheetId !== "string" || sheetId.trim() === "") {
    return c.json({ success: false, error: "Field 'sheetId' is required" }, 400);
  }
  if (typeof worksheetName !== "string" || worksheetName.trim() === "") {
    return c.json({ success: false, error: "Field 'worksheetName' is required" }, 400);
  }

  let sa: ServiceAccount;
  try {
    sa = parseServiceAccount(c.env);
  } catch {
    return c.json({ success: false, error: "Server configuration error: invalid service account" }, 500);
  }

  const sheetsService = new GoogleSheetsService(sa);
  const result = await sheetsService.testConnection(sheetId.trim(), worksheetName.trim());

  if (result.connected) {
    return c.json({ success: true, data: { message: result.message, code: result.code } });
  }
  return c.json({ success: false, error: result.message }, 422);
});

export { categoriesRouter };
