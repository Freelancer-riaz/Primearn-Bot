# PrimeEarn Bot — Setup Guide

This project follows a **Cloudflare-first** workflow. All production secrets live
exclusively in Cloudflare Worker Secrets. Replit (or any other editor) is used
only for editing code, type checking, and pushing to GitHub. No production
credentials are ever stored in the editor.

---

## Workflow overview

```
GitHub ──(push to main)──► GitHub Actions ──(wrangler deploy)──► Cloudflare Workers
  ▲                                                                       │
  │                                                             Reads secrets from
  │                                                          Cloudflare Worker Secrets
  │
Replit / local editor
(code edits, typecheck, git push — no production secrets needed here)
```

---

## 1 · Clone or import from GitHub

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO
pnpm install
```

When importing into Replit, use **Import from GitHub**. No secrets need to be
configured in Replit — it is used for editing and pushing code only.

---

## 2 · Edit code in Replit (or locally)

All source files live under `artifacts/api-server/src/`.

Useful commands (no secrets required):

```bash
# Type-check the whole project
pnpm run typecheck

# Type-check the API server only
pnpm --filter @workspace/api-server run typecheck

# Build (dry-run, no deployment)
pnpm run build
```

---

## 3 · Run locally with Wrangler dev (optional)

To run the bot locally you need a `.dev.vars` file with development/test
credentials. **These are never committed.**

```bash
# One-time setup: scaffold .dev.vars from the template
cd artifacts/api-server
node generate-dev-vars.mjs

# Open .dev.vars and fill in your test credentials, then start the dev server
pnpm --filter @workspace/api-server run dev
```

See `artifacts/api-server/.dev.vars.example` for all required fields and how
to obtain each value.

> **Note**: Use a separate Telegram test bot and a separate Firebase project for
> local development so you never touch production data.

---

## 4 · Push to GitHub → auto-deploy to Cloudflare

Any push to the `main` branch triggers the GitHub Actions workflow
(`.github/workflows/deploy.yml`), which runs `wrangler deploy` automatically.

**One-time GitHub repository secrets required** (Settings → Secrets and
variables → Actions):

| Secret | How to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token (use the "Edit Cloudflare Workers" template) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar of any Workers page |

These are GitHub CI/CD secrets only — they authorise the deployment. They are
**not** the bot's runtime secrets.

---

## 5 · Cloudflare Worker Secrets (production)

All bot runtime secrets are stored in Cloudflare Worker Secrets and injected by
Cloudflare at request time. They are **never stored in Replit, GitHub, or `.dev.vars`**.

Set each secret once using the Wrangler CLI (run from your local machine where
you have Cloudflare credentials):

```bash
cd artifacts/api-server

npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
# Paste the single-line JSON when prompted

npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put SUBMISSION_MAX_FILE_SIZE_BYTES   # optional
```

Or set them from the Cloudflare dashboard:
**Workers & Pages → primeearn → Settings → Variables and Secrets**

### Required secrets

| Secret | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK service account JSON, flattened to a single line (`jq -c . service-account.json`) |
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) |
| `WEBHOOK_SECRET` | Random string used to verify Telegram webhook calls (`openssl rand -hex 32`) |
| `SUBMISSION_MAX_FILE_SIZE_BYTES` | *(optional)* Max Excel upload size in bytes. Defaults to 10 MB if unset. |

---

## 6 · Register the Telegram webhook

After deployment, register the webhook once so Telegram knows where to send updates:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://primeearn.<YOUR_SUBDOMAIN>.workers.dev/webhook",
    "secret_token": "<WEBHOOK_SECRET>"
  }'
```

Replace `<TELEGRAM_BOT_TOKEN>`, `<YOUR_SUBDOMAIN>`, and `<WEBHOOK_SECRET>` with
the actual values. The `secret_token` must match `WEBHOOK_SECRET` stored in
Cloudflare Worker Secrets.

---

## Architecture summary

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| Web framework | Hono 4 |
| Bot framework | grammY + @grammyjs/conversations |
| Database | Firestore via Firebase Admin SDK |
| Language | TypeScript 5.9 |
| Package manager | pnpm workspaces |

Secrets flow: **Cloudflare Worker Secrets → Worker env bindings → `Env` interface** (`src/config/env.ts`). No secrets are needed at build time.
