import type { Context } from "hono";
import { AppError } from "../core/errors/AppError";
import { logger } from "../core/logger";

/**
 * Global error handler for Hono.
 * Converts AppError subclasses to structured JSON responses.
 */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    logger.warn(err.message, { code: err.code, statusCode: err.statusCode });
    return c.json(
      { ok: false, error: err.message, code: err.code },
      err.statusCode as Parameters<typeof c.json>[1],
    );
  }

  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  return c.json(
    { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" },
    500,
  );
}
