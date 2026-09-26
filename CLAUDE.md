@AGENTS.md

# Lodestar (Canvas Planner)

**Read `PROGRESS.md` first** (active TODOs, decisions, gotchas). Before ending a session, or on "wrap up"/"save progress", update it: what changed, decisions, TODOs. Re-read it after context compaction.

## What this is
Next.js (App Router) student planner named **Lodestar**. A Chrome extension (`canvas-extension/`) bridges the student's Canvas session to the app; an LLM scans announcements for hidden tasks and scores priority/time; finished tasks earn XP + Starlight, spent to chart real constellations on the Star Chart. Weekly drag-grid planner, Pomodoro ("The Watch"), YouTube music ("Comms"). Google OAuth or email/password (NextAuth v5 beta, JWT sessions, terms/13+ gate), Postgres via Prisma 7. Logged-out `/` is the marketing page (`components/landing/`, spec `HomepageSpec.md`). The logo is a **temporary** placeholder.

## Conventions
- 4-space indent, double quotes, semicolons (no Prettier; match surrounding code). Import via `@/*`.
- Types: `type` aliases in `types/*.ts`, one concept per file; single-use types stay local. `lib/*.ts` is framework-free pure logic (no Next/React imports).
- Components: default export, PascalCase, `type Props` above, `"use client"` first line when needed.
- Comments only for non-obvious *why*.
- API routes (`app/api/**/route.ts`): `try/catch` → `console.error` + `{ success: false, error }` with a status; call `auth()`, look up the user by `session.user.email` via `prisma.user.findUnique`, scope every query by `user.id`, never trust a client `userId`. Extension-facing routes also accept a `Bearer` `ExtensionSession` token (see `app/api/canvas/sync/route.ts`; skill `api-route-handler`).
- AI calls use Claude Haiku (`lib/ai/anthropicClient.ts`) when `ANTHROPIC_API_KEY` is set, else local Ollama; always a timeout and deterministic fallback. Anthropic is paid: batch, don't re-analyze unchanged input, log via `logAnthropicUsage`.
- Dates are `"YYYY-MM-DD"` strings; use `parseLocalDate`/`toDateKey`/`getTodayString` (`lib/utils.ts`), never `new Date("YYYY-MM-DD")` or `toISOString()` for a calendar day.
- UI controls come from `components/ui/` and `DatePicker` (Radix + react-day-picker), not native `<select>`/date/time/checkbox/`confirm()`/`title=`. Don't put `focus:outline-none` on them.

## Running
`npm run dev` · `npm run build` · `npm run lint` (has known pre-existing `set-state-in-effect` errors). **No test framework** — `lib/*.test.ts` are manual `npx tsx` scripts (prioritization needs local Ollama); never claim "tests pass". DB: `prisma/schema.prisma` → `npx prisma migrate dev` + `npx prisma generate`; client in `app/generated/prisma`. Deploy: Vercel auto-deploys `main` (`https://lodestarplanner.vercel.app`, may change); env vars live in Vercel, not `.env`. **Local and production share one database.**

## Never
- Commit `.env*` or secrets; hand-edit `app/generated/prisma/**`; edit the `nextjs-agent-rules` block in `AGENTS.md` (`next dev` owns it).
- Add a test framework, state library or other dependency without asking.
- Query across users' data or authorize on `session.user.email` alone.
