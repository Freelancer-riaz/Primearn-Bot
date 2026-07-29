/**
 * Dev-environment bootstrap helper.
 *
 * Copies .dev.vars.example → .dev.vars if .dev.vars does not yet exist.
 * Run once after cloning the repo to set up local Wrangler dev credentials.
 *
 *   node generate-dev-vars.mjs
 *
 * Then open .dev.vars and fill in your actual development/test values.
 * Never commit .dev.vars — it is listed in .gitignore.
 *
 * NOTE: This script does NOT read from Replit Secrets or any environment
 * variable. Production secrets live exclusively in Cloudflare Worker Secrets.
 */
import { existsSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplePath = resolve(__dirname, ".dev.vars.example");
const targetPath = resolve(__dirname, ".dev.vars");

if (existsSync(targetPath)) {
  console.log("[setup] .dev.vars already exists — skipping.");
  console.log("[setup] Edit it manually to update your local dev credentials.");
} else if (!existsSync(examplePath)) {
  console.error("[setup] ERROR: .dev.vars.example not found.");
  process.exit(1);
} else {
  copyFileSync(examplePath, targetPath);
  console.log("[setup] Created .dev.vars from .dev.vars.example.");
  console.log("[setup] Open .dev.vars and fill in your development/test values.");
}
