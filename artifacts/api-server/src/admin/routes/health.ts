import { Hono } from "hono";
import type { Env } from "../../config/env";

const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get("/", (c) =>
  c.json({ success: true, message: "Admin authentication successful" }),
);

export { healthRouter };
