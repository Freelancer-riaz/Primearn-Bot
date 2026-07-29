---
name: Wrangler runtime
description: Local Wrangler version and the deferred runtime upgrade decision.
---

The installed Wrangler requires Node.js 22 or newer, while the current Replit environment may still provide Node.js 20. TypeScript checks can run independently; defer the runtime upgrade until deployment unless the user requests it earlier.

**Why:** The user explicitly chose to ignore the local Node.js warning during Phase 3 Part 2 and update the runtime before deployment.

**How to apply:** Do not change runtime configuration just to run local Wrangler during feature work; report the build limitation clearly and revisit it before deployment.