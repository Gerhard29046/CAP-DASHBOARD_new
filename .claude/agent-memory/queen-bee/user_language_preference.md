---
name: user-language-preference
description: User's favorite programming language is TypeScript, though this repo's frontend is intentionally plain JS/JSX
metadata:
  type: user
---

The user's favorite programming language is TypeScript.

**Why relevant here:** This repo's `CLAUDE.md` explicitly forbids incidental TypeScript conversion in `frontend/` — it's a JavaScript/JSDoc project (`npm run typecheck` runs `tsc -p ./jsconfig.json` for type-checking JS via JSDoc, not an actual `.ts`/`.tsx` migration).

**How to apply:** Don't convert `.js`/`.jsx` files to `.ts`/`.tsx` based on this preference alone — that would violate explicit project convention. If the user ever wants a deliberate TS migration, treat it as a significant, explicitly-approved decision (record in `docs/ai-memory/DECISIONS.md`), not an incidental change. In other contexts (new tooling scripts, Cloud Functions, discussions/explanations), lean toward TypeScript idioms and syntax when it's a genuinely free choice.
