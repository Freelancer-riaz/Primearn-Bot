import { app } from "./app";
import type { Env } from "./config/env";

/**
 * Cloudflare Worker entry point.
 * Delegates all requests to the Hono app.
 */
export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
