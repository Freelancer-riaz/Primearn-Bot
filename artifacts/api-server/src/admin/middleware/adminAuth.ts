import type { Context, Next } from "hono";
import type { Env } from "../../config/env";

/**
 * Admin authentication middleware.
 * Expects:  Authorization: Bearer <ADMIN_SECRET>
 * Rejects with HTTP 401 if the token is missing or does not match.
 */
export async function adminAuth(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token || token !== c.env.ADMIN_SECRET) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  return next();
}
