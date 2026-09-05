# Checklist detail and rationale

## 1. Auth/scoping

Every route that reads/writes user data resolves the user server-side:

```ts
const session = await auth();
if (!session?.user?.email) return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
const user = await prisma.user.findUnique({ where: { email: session.user.email } });
```

**Why it matters**: there's no test suite or CI to catch an IDOR-style bug
(e.g. a route that takes `userId` from the request body and queries by it
directly). This has to be caught in review.

Extension-facing routes (`canvas-extension/` calls them directly, not
through the browser session) also need the `Bearer` + `ExtensionSession`
fallback — see `app/api/canvas/sync/route.ts`. Flag a new extension route
that skips this.

## 2. Generated/gitignored files

- `app/generated/prisma/**` is produced by `prisma generate` and is
  gitignored (see `.gitignore`). A diff that touches files in there means
  someone edited generated output directly — the fix is to change
  `prisma/schema.prisma` and regenerate, not to hand-patch the output.
- `.env*` must never appear in `git status`/`git diff` output as staged. If
  it does, stop and flag it — don't just "gitignore it after the fact" if
  it's already been committed (that needs history scrubbing, which is a
  separate, bigger conversation with the user).

## 3. Ollama calls

Reference implementation: `app/api/task-xp/route.ts`. Anti-pattern to flag:
`lib/analyzeAssignment.ts`'s `fetch` has no `AbortSignal.timeout(...)`, so a
hung local Ollama server hangs the whole `task-planning` request chain
(it's called per-task, in `Promise.all`, from `app/api/task-planning/route.ts`).
If you touch that file, this is worth fixing or at least flagging.

Also check: is the model's raw JSON response used directly anywhere, or is
every numeric field clamped/normalized first (`normalizeAnalysis`,
`normalizeXp`)? An LLM can return out-of-range or non-numeric values.

## 4. `"use client"` boundary

Components under `components/` are `"use client"` (see `AssignmentCard.tsx`).
Check that:
- No `lib/prisma.ts`, `@/auth`, or `process.env.*_SECRET`/`*_KEY` value is
  imported into or passed as a prop into a client component.
- Client components only receive already-serialized data from a server
  component or API response.

## 5. Migrations

`prisma.config.ts` points at `prisma/migrations/`. A schema change without a
matching migration file will drift local/dev databases apart silently
(there's no CI step that runs `prisma migrate diff` to catch this). If a
migration drops or renames a column/table, call it out explicitly rather
than letting it pass silently — there's real user data via Google OAuth
sign-ins in this app.

## 6. Style consistency

This repo has no `.prettierrc` — style is convention-only:
- 4-space indentation (not the eslint-config-next/Prettier default of 2).
- Double-quoted strings, semicolons.
- `@/*` path alias instead of `../../` relative imports.
- Comments only for non-obvious *why* (see `lib/prioritization.ts`'s block
  comment on urgency weighting) — flag comments that just restate the code.

## 7. No speculative dependencies

This is a solo/student project (see `package.json` — no test runner, no CI,
no lint-staged/husky). Don't let a review comment turn into "add Vitest" or
"add Zod for validation" unless the user actually asked for that — flag the
underlying issue and let them decide whether it's worth a new dependency.
