---
name: code-review
description: Use before committing/opening a PR in this repo, or when the user asks to review pending changes here — a project-specific checklist layered on top of general code review, covering this repo's auth, Prisma, and Ollama-fallback conventions. Complements (does not replace) the built-in /code-review command.
metadata:
  type: project
---

# Project-specific review checklist for canvas-planner

Run this in addition to normal correctness/quality review. It exists
because this repo has a few conventions that are easy to violate silently
(no CI/tests catch them). Full detail and rationale for each item is in
`checklist.md`.

Quick pass over the diff:

1. **Auth/scoping** — any new `app/api/**/route.ts` code checks
   `session.user.email` → `prisma.user.findUnique` and scopes every query by
   `user.id`? No route trusts a client-supplied `userId` directly?
2. **Generated/gitignored files** — no hand edits under
   `app/generated/prisma/**`? No `.env`/`.env*` staged?
3. **Ollama calls** — any new `fetch` to the local Ollama server has a
   timeout (`AbortSignal.timeout`) and a deterministic fallback path, and
   the model's JSON response is normalized/clamped before use, not trusted
   raw?
4. **`"use client"` boundary** — no server-only code (Prisma, `auth()`,
   `process.env` secrets) imported into a file marked `"use client"` or
   passed into one via props?
5. **Migrations** — if `prisma/schema.prisma` changed, is there a
   corresponding migration under `prisma/migrations/`, and does the diff
   avoid a destructive column/table drop without the user being told?
6. **Style consistency** — 4-space indent, double quotes, `@/*` imports
   instead of deep relative paths (matches root `CLAUDE.md`).
7. **No speculative test framework / dependency** added to fix a review
   comment — flag it instead of installing something new.

If a finding matches one of these, cite the specific rule from
`checklist.md` rather than re-deriving the reasoning inline.
