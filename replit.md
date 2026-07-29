# PrimeEarn Bot

A Telegram bot running on Cloudflare Workers that lets users submit Excel files and earn rewards.

## Run & Operate

**Replit is for editing and type-checking only — no production secrets are needed here.**

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build (wrangler dry-run)
- `pnpm --filter @workspace/api-server run typecheck` — typecheck the API server only

**Local Wrangler dev** (requires `.dev.vars` with test credentials):

- `cd artifacts/api-server && node generate-dev-vars.mjs` — scaffold `.dev.vars` from example (one-time)
- `pnpm --filter @workspace/api-server run dev` — start wrangler dev server on port 8080

**Deployment**: push to `main` → GitHub Actions runs `wrangler deploy` automatically.
All production secrets live in Cloudflare Worker Secrets — see `SETUP.md` for full instructions.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/` — all bot source code (Cloudflare Worker + Hono + grammY)
- `artifacts/api-server/wrangler.toml` — Worker configuration
- `artifacts/api-server/.dev.vars.example` — template for local dev secrets
- `.github/workflows/deploy.yml` — CI/CD pipeline (push to main → deploy to Cloudflare)

## How to use Replit

Replit is used for **code editing and GitHub push only**. No production secrets needed here.

```bash
# Install dependencies
pnpm install

# Type-check the whole project
pnpm run typecheck

# Type-check API server only
pnpm --filter @workspace/api-server run typecheck

# Push to GitHub (triggers auto-deploy via GitHub Actions → Cloudflare Workers)
git add . && git commit -m "your message" && git push origin main
```

For local dev with a live Wrangler server, see `SETUP.md` (requires `.dev.vars` with test credentials).

## Architecture decisions

- Cloudflare Workers runtime (no Node.js in production) — deploy via `wrangler deploy`
- Secrets live exclusively in Cloudflare Worker Secrets; never in Replit or `.env`
- GitHub Actions handles all deployments on push to `main`

## Product

PrimeEarn Bot — a Telegram bot running on Cloudflare Workers.

## User preferences

- ব্যবহারকারীর সঙ্গে সম্পূর্ণ বাংলায় যোগাযোগ করতে হবে।
- ভবিষ্যতে কোনো কোড যোগ বা সম্পাদনা করা হলে পরিবর্তনের পরপরই GitHub-এর `origin` রিপোজিটরিতে commit করে push করার চেষ্টা করতে হবে।
- শুধু ব্যবহারকারী যে feature-এর নাম বলবে, সেটাই implement করতে হবে। অন্য কোনো optimization, refactor, formatting, dependency update বা unrelated file edit করা যাবে না।
- কাজ শেষ হলে রিপোর্ট করতে হবে: কোন কোন file পরিবর্তন হয়েছে, কী implement হয়েছে, commit hash এবং push status।

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
