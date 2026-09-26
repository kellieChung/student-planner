---
name: code-review
description: Use before committing/opening a PR in this repo, or when asked to review pending changes here — a project-specific checklist on top of general review, covering this repo's auth, Prisma, AI-call and style conventions. Complements (does not replace) the built-in /code-review command.
metadata:
  type: project
---

# Project review checklist

No CI or tests catch these, so check the diff for each:

1. **Auth/scoping:** new `app/api/**/route.ts` code resolves the user (`auth()` → `session.user.email` → `prisma.user.findUnique`) and scopes every query by `user.id`; nothing trusts a client-supplied `userId` (IDOR). Extension-facing routes also accept the `Bearer` + `ExtensionSession` fallback (`app/api/canvas/sync/route.ts`).
2. **Generated/secret files:** no hand edits under `app/generated/prisma/**` (change `schema.prisma` and regenerate); no `.env*` staged (if one was already committed, stop and tell the user; history scrubbing is a separate conversation).
3. **AI calls:** every model call (Anthropic or Ollama `fetch`) has a timeout (`AbortSignal.timeout`) and a deterministic fallback; model JSON is normalized/clamped before use; Canvas HTML passes through `lib/htmlText.ts` before a prompt; Anthropic calls are batched and logged (`logAnthropicUsage`).
4. **`"use client"` boundary:** no `lib/prisma`, `@/auth` or secret env values in, or passed as props into, a client component (e.g. importing `lib/taskLabel` into a client file drags the Anthropic SDK in).
5. **Migrations:** a `schema.prisma` change has a matching `prisma/migrations/` entry; flag any column/table drop or rename explicitly (the DB is shared with production and holds real user data).
6. **Style:** 4-space indent, double quotes, semicolons, `@/*` imports, comments only for non-obvious why (`CLAUDE.md`).
7. **Dependencies/tests:** don't let a review comment add a test framework or library unasked; flag the underlying issue instead.
8. **UI kit & dates:** no new native `<select>`/date/time/checkbox/`confirm()`/`title=` (use `components/ui/` and `DatePicker`); no `focus:outline-none` on them; calendar days never go through `new Date("YYYY-MM-DD")` or `toISOString()` (use `parseLocalDate`/`toDateKey`).

Cite the rule number rather than re-deriving the reasoning.
