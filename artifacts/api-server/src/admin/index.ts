import { Hono } from "hono";
import type { Env } from "../config/env";
import { adminAuth } from "./middleware/adminAuth";
import { healthRouter } from "./routes/health";
import { categoriesRouter } from "./routes/categories";

const adminRouter = new Hono<{ Bindings: Env }>();

// Protect every /admin/* route with Bearer token authentication.
adminRouter.use("*", adminAuth);

// GET /admin/health
adminRouter.route("/health", healthRouter);

// CRUD /admin/categories
adminRouter.route("/categories", categoriesRouter);

export { adminRouter };
