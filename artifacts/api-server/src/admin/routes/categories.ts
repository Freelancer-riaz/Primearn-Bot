import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../../config/env";
import { CategoryService } from "../../services/CategoryService";
import { NotFoundError, ValidationError } from "../../core/errors/AppError";
import { initFirebase } from "../../config/firebase";

const categoriesRouter = new Hono<{ Bindings: Env }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getService(env: Env): CategoryService {
  const app = initFirebase(env);
  return new CategoryService(app);
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

export { categoriesRouter };
