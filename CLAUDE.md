@AGENTS.md

# Canvas Planner

## Start here

Read `PROGRESS.md` before doing anything else — it has active TODOs, recent
architectural decisions, and a per-session changelog so you don't need to be
re-briefed. Update it before ending a session: append what you changed, note
any new decisions, and adjust the TODO list.

## What this project is

**Lodestar** is a Next.js (App Router) student planner that syncs assignments, discussions,
and announcements from Canvas LMS (via a companion Chrome extension in
`canvas-extension/` that bridges Canvas session cookies to the app), uses an
LLM to estimate assignment importance/difficulty/time and turn that into a
priority score and an XP + Starlight reward (Starlight charts stars in real
constellations on the Star Chart; the old medieval town/Nano is retired but
kept in the repo), and presents it all in a weekly
drag-grid planner UI alongside a Pomodoro timer and a YouTube-backed music
player. Auth is Google OAuth or email/password (Credentials, JWT sessions)
via NextAuth v5 (beta), with a terms/13+ consent gate, data lives in Postgres
via Prisma 7.

**Branding:** the product is named Lodestar. The logo is **temporary** —
`public/brand/lodestar-logo-temp.png` (plus `app/icon.png` /
`app/apple-icon.png` resized from it) is a placeholder to be replaced with
the final artwork. Logged-out visitors to `/` see the marketing page in
`components/landing/` (built to `HomepageSpec.md`).

## Session Protocol
- At the start of every session, read PROGRESS.md before doing anything else.
- Before ending a session (or when the user says "wrap up" / "save progress"), 
  update PROGRESS.md with: what changed, key decisions made, and current TODOs.
- If context gets compacted mid-session, re-read PROGRESS.md afterward to recover anything lost.

## Conventions detected in this codebase

- **Indentation is 4 spaces**, double-quoted strings, semicolons — this
  differs from the eslint-config-next/Prettier default of 2 spaces. There is
  no `.prettierrc`; the style is enforced by convention only, so match
  surrounding code rather than your default formatting.
- **Path alias**: import via `@/*` (e.g. `@/lib/prisma`, `@/types/assignment`)
  instead of relative `../../` paths.
- **Types** live under `types/*.ts` as `type` aliases (not `interface`), one
  domain concept per file (`assignment.ts`, `taskPlanning.ts`, ...). A type
  used by only one module (e.g. `analyzeAssignment.ts`'s `AssignmentAnalysis`)
  is declared locally in that module instead.
- **`lib/*.ts`** holds framework-free business logic and pure functions
  (`prioritization.ts`, `taskPlanning.ts`, `utils.ts`). Keep these testable
  and free of Next.js/React imports.
- **API routes** (`app/api/**/route.ts`) follow a consistent shape: `try {}
  catch { console.error(...); return NextResponse.json({ success: false,
  error }, { status }) }`. Routes that need a user call `auth()` from `@/auth`,
  look the user up by `session.user.email` via `prisma.user.findUnique`, and
  scope all Prisma queries by that `user.id`. Extension-facing routes
  additionally accept a `Bearer` token checked against `ExtensionSession`
  (see `app/api/canvas/sync/route.ts`). See the `api-route-handler` skill.
- **AI calls** (`lib/ai/analyzeAnnouncement.ts`, `lib/ai/findDuplicateTask.ts`,
  `lib/analyzeAssignment.ts`) use Claude Haiku via `lib/ai/anthropicClient.ts`
  when `ANTHROPIC_API_KEY` is set (Vercel can't reach a local Ollama), and
  local Ollama otherwise. Both paths must degrade gracefully: `try/catch`
  with a deterministic fallback, and a timeout on every call. Every
  Anthropic call is paid — batch, avoid re-analyzing unchanged input, and
  log spend via `logAnthropicUsage`. XP (`app/api/task-xp`) is purely
  time-based, no model call.
- **Comments are sparse** — only used to explain non-obvious *why* (see the
  block comment in `lib/prioritization.ts` and `lib/utils.ts`). Don't add
  comments that restate the code.
- Components are default-exported, PascalCase-named, with a `type Props`
  object above them; `"use client"` is the first line when needed.

## Running things

- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint` (flat ESLint config: `eslint-config-next` core-web-vitals
  + typescript, see `eslint.config.mjs`)
- **Tests: there is no test framework installed** (no jest/vitest/mocha in
  `package.json`). `lib/prioritization.test.ts` is an ad-hoc manual script,
  not an automated test — it calls the real `analyzeAssignment` (which hits a
  local Ollama server at `localhost:11434`) and just prints output. Run it
  with `npx tsx lib/prioritization.test.ts` (requires Ollama running
  locally). Don't report "tests pass" — there's nothing automated to run,
  and don't assume Jest/Vitest APIs (`describe`, `expect`, ...) exist in this
  repo.
- Database: schema is `prisma/schema.prisma`, config in `prisma.config.ts`
  (uses `@prisma/adapter-pg`). Client generates to `app/generated/prisma`.
  Typical flow: `npx prisma migrate dev` then `npx prisma generate`.
- **Deployment: Vercel**, connected to the `kellieChung/student-planner`
  GitHub repo, auto-deploying on push to `main`. Production URL as of
  2026-09-21: `https://student-planner-beta.vercel.app/` (may change —
  check Vercel's dashboard if this looks stale). Uses the existing
  `build` script as-is; no separate Vercel config. **A `git push` is
  required to get any code change live** — env vars are the exception:
  set directly in Vercel's Project Settings → Environment Variables
  (separate from the local, gitignored `.env`), taking effect on the next
  deploy with no code push needed. **Production and local dev currently
  point at the same Postgres database** — there is no environment split
  right now, so testing against `npm run dev` locally touches the exact
  same rows the deployed app reads/writes, not a sandbox copy.

## Never do this

- Never commit `.env`/`.env*` files or paste real secrets into code or
  commits — `.env*` is already gitignored; keep it that way.
- Never hand-edit anything under `app/generated/prisma/**` — it's
  regenerated by `prisma generate` and is gitignored. Change
  `prisma/schema.prisma` and regenerate instead.
- Never edit the `<!-- BEGIN:nextjs-agent-rules -->...<!-- END -->` block in
  `AGENTS.md`/`CLAUDE.md` by hand — `next dev` owns and rewrites it
  (see `node_modules/next/dist/server/lib/generate-agent-files.js`).
- Never add a test framework, state-management library, or other new
  dependency speculatively — this is a solo/student project; ask first.
- Never trust `session.user.email` alone for authorization without the
  `prisma.user.findUnique` + scoping-by-`user.id` pattern already used in
  every route — don't query across all users' data.
