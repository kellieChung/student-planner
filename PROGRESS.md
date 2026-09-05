# Progress log

Read this before starting work in this repo; update it before ending a
session. Keep entries short — this is a scratchpad for continuity, not
documentation (that's what `CLAUDE.md` and code comments are for).

## Architecture decisions

- **AI scoring runs against a local Ollama server**, not a hosted API —
  `lib/analyzeAssignment.ts` calls `http://localhost:11434` directly
  (hardcoded), `app/api/task-xp/route.ts` calls it via `OLLAMA_URL` env var
  with the same default. Every caller needs a deterministic fallback since
  Ollama may not be running (see `api-route-handler` skill).
- **Canvas integration goes through a Chrome extension**
  (`canvas-extension/`), not a server-to-server Canvas API integration —
  the extension reads the user's existing Canvas session/cookies in-browser
  and posts synced data to `app/api/canvas/sync`, authenticated via a
  `Bearer` token backed by `prisma.extensionSession` (issued through
  `app/api/extension/auth`). This is because Canvas doesn't give students a
  simple way to mint their own API token for a third-party app.
- **Priority scoring is urgency-dominant by design** (`lib/prioritization.ts`):
  urgency is 50% of the score specifically so the planner won't rank a hard
  assignment due next week above a routine one due tonight. Don't rebalance
  these weights without checking this reasoning first.
- **Personalized "procrastination index" per task type** (see
  `prioritizationModule.md` for the full spec, `lib/procrastinationHistory.ts`
  for the implementation): every completed task with a known `assignmentType`,
  due date, and "added" timestamp logs a `{taskType, addedAt, dueAt,
  completedAt}` record in localStorage (rolling window of the last 12 per
  type). `getProcrastinationIndexHours(type)` averages hours-before-deadline
  across those, excluding records whose add→due window was under 24h (no real
  chance to procrastinate). `calculatePriority()` in `lib/prioritization.ts`
  takes this as an optional `procrastinationIndexHours` input and shifts the
  *effective* due date earlier (capped at 120h, only when the index is below
  a 48h "healthy lead time" baseline) — so a task type the student
  chronically leaves late surfaces sooner even when its literal deadline
  isn't nearest. No history yet for a type → behaves exactly like before
  (verified: `calculatePriority` is backward-compatible when the field is
  omitted, since every existing caller omits it).
- **`assignmentType` is now actually captured**, not just requested: the
  Ollama prompt in `lib/analyzeAssignment.ts` always asked for it but the
  code discarded it. Both `analyzeAssignment.ts` and the fallback path in
  `app/api/task-planning/route.ts` now normalize it against a fixed enum
  (`ASSIGNMENT_TYPES`, defaulting unknown values to `"other"`) and it's
  persisted on `TaskPlanningEstimate` — it's the grouping key the
  procrastination index uses.
- **`estimatedMinutes` is NOT AI-generated anymore** (removed 2026-09-05 —
  wasted AI calls for little value, and wasn't even used in
  `calculatePriority`'s actual scoring formula). `lib/analyzeAssignment.ts`
  no longer asks Ollama for it at all. `estimateMinutesByType()` (same
  file) is a deterministic type→minutes lookup, used everywhere
  `estimatedMinutes` is needed (`app/api/task-planning/route.ts` for both
  the AI and fallback paths). A per-student historical estimator (actual
  completion time by type) is the planned next step, not built yet.
- **Ollama calls are batched, not one-per-item**, to cut total round-trips
  (each call resends the full instructional prompt regardless of batch
  size): `analyzeAssignments()` (`lib/analyzeAssignment.ts`, batch size 5,
  wired through `app/api/task-planning/route.ts`), `analyzeAnnouncements()`
  (`lib/ai/analyzeAnnouncement.ts`, batch size 5), and `findDuplicateTasks()`
  (`lib/ai/findDuplicateTask.ts`, batched per-announcement since all of one
  announcement's proposed tasks already share the same assignment context).
  Shared `mapWithConcurrency`/`chunk` helpers live in `lib/concurrency.ts`.
  A malformed/missing entry anywhere in a batch fails the *whole* batch,
  falling back to the deterministic heuristic for everything in it —
  deliberate simplicity/robustness tradeoff, not partial recovery.
- **`app/api/task-xp/route.ts` skips its Ollama call entirely when a
  deterministic `estimatedMinutes`-based XP value is available** — it used
  to call Ollama unconditionally and then discard the result whenever
  `timeBasedXp` existed, which after the estimatedMinutes change above is
  now nearly always. Also switched its model default from `llama3.2:latest`
  to `qwen2.5:3b-instruct` (matching every other call site) to avoid Ollama
  swapping two different models in and out of GPU memory.
- **"Up Next" card in `WeeklyPlannerView.tsx`** surfaces the single
  highest-`calculatePriority().score` open task, independent of the
  existing `getTaskPriority`-based grid sort (deliberately left untouched —
  see below). Computed in a `useMemo`; the procrastination indices it reads
  are loaded into state via a `useEffect` (never call `localStorage`
  directly during render — this component is server-rendered first, and
  `localStorage` doesn't exist there. Every other localStorage read in this
  file already follows that rule; the new code matches it).
- **No test framework is installed.** `lib/prioritization.test.ts` is a
  manual verification script (run with `npx tsx`), not part of any suite —
  it now also has a synthetic (non-Ollama-dependent) demonstration of the
  procrastination adjustment, runnable even without Ollama up.

## Active TODOs (as of 2026-09-05, later)

- **Not yet verified live in the browser**: the new "🧠 Estimating N
  tasks..." indicator in `WeeklyPlannerView.tsx`, and that GPU usage is
  actually noticeably lower now — verified the batching mechanics work
  correctly against real Ollama (manual script + ad-hoc test), but haven't
  measured actual GPU load before/after with the real 197-assignment
  backlog in the browser.
- The `findDuplicateTasks` batching occasionally still misses an obvious
  duplicate in ad-hoc testing (e.g. "Read chapters 2-3" vs. an assignment
  literally titled "Beowulf Reading Response: Read chapters 2-3...") — this
  looks like inherent model judgment variance in the 3B model, not a
  regression from batching (batch size was 1 in that specific test), but
  worth a closer look if duplicate-detection quality seems to have dropped
  after this change.
- **Not yet verified live**: open the new "📚 Courses" manager in the
  browser, toggle a course hidden, confirm its assignments disappear from
  the planner after `router.refresh()` (no full reload needed), and confirm
  it stays hidden after a real Canvas re-sync. Also try "Delete" on a
  course that's still Canvas-active and confirm it reappears (un-hidden)
  after the next sync — that's expected, not a bug (see the note in
  `ManageCoursesModal.tsx`'s description text).
- **Canvas sync reconciliation only prunes courses, not individual
  assignments/discussions/announcements within a still-active course.**
  Deliberate scope trim: `canvas-extension/background.js`'s `getCanvasData()`
  does a flat `per_page=100` fetch with no pagination follow-up, so a course
  with >100 assignments could have real, still-relevant ones wrongly pruned
  if per-item reconciliation were added naively. Fix the pagination gap
  first if per-item pruning is wanted later.
- The existing `getTaskPriority`-based sort/labels used throughout the
  weekly grid were intentionally **not** replaced with the new
  `calculatePriority`-based scoring — only the new "Up Next" card uses it.
  If the grid itself should eventually sort by the same AI+history score,
  that's a separate, larger change (touches grid-span layout logic too).
- Only verified via `tsc --noEmit`, `eslint`, `next build`, and the manual
  `npx tsx lib/prioritization.test.ts` script — **the "Up Next" card and
  completion-history recording were not exercised in a live browser**
  (the app is gated behind Google OAuth + a real Postgres DB with no test
  credentials available in this environment). Worth clicking through by
  hand: add a task, mark it done, confirm `procrastination_history` in
  localStorage grows, and that a second task of the same type gets
  bumped up appropriately.
- **Not yet verified live**: trigger a real Canvas sync from the extension
  after deploying this session's changes, and confirm inactive/old courses
  actually disappear from the planner (stale rows already in Postgres won't
  clear until the next sync runs — reconciliation only happens during sync).
- Nothing from this session is committed yet.

## Session log

### 2026-09-05 (latest+1) — focus a task in the Pomodoro timer

Added the ability to designate one task as "the one I'm working on,"
connected to the existing priority system:
- `components/WeeklyPlannerView.tsx`: new `activeFocusTaskId` state
  (persisted to a new localStorage key `pomodoro_active_task_id`, hydrated
  in the existing mount effect). `activeFocusTask` is derived live each
  render (only the id is stored) via a `computeTaskPriority(task)` helper
  factored out of the existing `upNext` logic, so both use identical
  scoring and can't drift. A small effect auto-clears the stored id if the
  task is completed/deleted/hidden — no explicit "clear on complete"
  wiring needed anywhere else.
- Selection UI: a "🎯 Focus in Pomodoro" button on the Up Next card, and a
  hover "🎯" button on every weekly-grid task card (`AssignmentCard.tsx`,
  new optional `onFocus`/`isFocused` props, same pattern as the existing
  `onDelete`). Deliberately skipped the compact month-view rows and the
  "no due date" list to keep the change contained (user-confirmed scope).
- `components/PomodoroTimer.tsx` went from zero props to
  `{focusTask, onClearFocusTask}` (single call site, so this was a safe,
  contained signature change) and now displays the focused task's name,
  course/due, and — the actual tie to prioritization — its
  `priority.reason` string from `calculatePriority`, plus a clear button.

Verified: `tsc`, `eslint`, `next build` all clean (no new lint issues
beyond the same pre-existing `set-state-in-effect` pattern already used
elsewhere in this file). **Not yet verified live in the browser** — click
through: focus a task from Up Next, focus a different one from the grid
(confirm it swaps and the ring highlight moves), mark the focused task
done (confirm it clears from the timer automatically), reload (confirm the
selection survives).

### 2026-09-05 (latest) — reduce Ollama GPU usage

User reported GPU usage was still high even when not touching AI-labeled
features. Investigated all 4 Ollama call sites (`lib/analyzeAssignment.ts`,
`lib/ai/analyzeAnnouncement.ts`, `lib/ai/findDuplicateTask.ts`,
`app/api/task-xp/route.ts`) and found the real driver via a direct
read-only DB query: **197 real assignments** for the actual user, most
likely never estimated in this browser — the automatic, silent
`useEffect` in `WeeklyPlannerView.tsx` that calls `/api/task-planning` for
every un-cached task has zero UI indicator, so a large backlog grinds
through Ollama invisibly. Separately, clicking "Analyze Announcements"
was firing one Ollama call per announcement PLUS one more per proposed
task for duplicate-checking — a fully sequential loop with no concurrency
issue, just sheer call volume, each resending a ~150-line instructional
prompt from scratch.

Mid-session, user redirected: drop AI-based time estimation entirely
(wasn't even used in scoring, wasted a full field's worth of prompt/output
on every call) in favor of a deterministic type-based lookup, with a
historical/personalized estimator as explicit future work — see the
architecture-decision bullets above for what changed in
`lib/analyzeAssignment.ts` and `app/api/task-planning/route.ts`.

Changes, in order of expected impact:
1. Batched `analyzeAssignments`/`analyzeAnnouncements`/`findDuplicateTasks`
   (5x fewer round-trips for a full task-planning backlog; N+M → far fewer
   for the announcement pipeline).
2. Removed AI time estimation (`estimatedMinutes`) — shorter prompts,
   shorter responses, one fewer thing to get wrong per call.
3. `task-xp` now skips Ollama entirely when a deterministic XP value is
   already available (previously always called it, then frequently
   discarded the result).
4. Added a "🧠 Estimating N tasks..." indicator so the background
   estimation flow is visible instead of mysterious.
5. Added missing timeouts (`analyzeAssignments`, `analyzeAnnouncements`,
   both previously had none) and `num_predict` caps across all 4 call
   sites; standardized `task-xp`'s model to `qwen2.5:3b-instruct` (was the
   only site using `llama3.2:latest`) to stop Ollama swapping two models in
   and out of GPU memory.

Verified: `tsc`, `eslint`, `next build` all clean; ran the batched
`analyzeAssignments` and the new `analyzeAnnouncements`/`findDuplicateTasks`
against the real local Ollama server with realistic multi-item batches and
confirmed correct ordering/indexing and sensible output (see Active TODOs
for the one duplicate-detection accuracy note and what's still unverified
live in the browser).

### 2026-09-05 (later) — manual course hide/delete

Follow-up to the same-day stale-data fix: automatic pruning only removes a
course once Canvas stops reporting it as active, but some teachers never
conclude a course, so it never drops out of the sync payload. Added manual
control:
- **Schema**: `CanvasCourse.hidden Boolean @default(false)`
  (`prisma/schema.prisma`, migration `20260905041240_add_course_hidden_flag`
  — ran `prisma migrate dev` + `prisma generate` directly against the dev
  DB). The sync route's `upsert` never touches `hidden` on update, so a
  user's hide choice survives every future re-sync even if Canvas still
  calls the course active.
- **New API**: `app/api/courses/route.ts` (GET, lists the user's courses
  including hidden ones) and `app/api/courses/[courseId]/route.ts` (PATCH
  to toggle `hidden`, DELETE to permanently remove — mirrors the existing
  `app/api/music/[playlistId]/route.ts` ownership-check pattern). Deleting
  a course still-active on Canvas will resurrect it (un-hidden) on the next
  sync — the UI copy says so; "hide" is the durable option.
- **Read-path filtering**: added `hidden: false` to every place that reads
  `CanvasCourse` for planner/AI purposes — `lib/canvas.ts`'s
  `getAllAssignments`/`getAllAnnouncements`, `app/api/planner/route.tsx`,
  `app/api/ai/analyze-announcements/route.ts`. The new `GET /api/courses`
  (for the management UI itself) deliberately does NOT filter by hidden,
  since the user needs to see hidden courses to un-hide them.
- **UI**: new `components/ManageCoursesModal.tsx` (checkbox per course to
  show/hide, a two-step "Delete"/"Confirm delete" per course), triggered by
  a new "📚 Courses" button in `WeeklyPlannerView.tsx`. On any change it
  calls `router.refresh()` (first use of Next's router refresh in this
  codebase) — re-runs the `app/page.tsx` server component, and the existing
  `useEffect(..., [assignments])` in `WeeklyPlannerView` already rebuilds
  `tasks` from the new prop, so no extra plumbing was needed there.

Verified: `next build` clean, migration applied against the real dev DB,
`prisma generate` regenerated the client (needed manually — `migrate dev`
didn't trigger it automatically this time). Lint: no new issue classes,
just one more instance of the same pre-existing `setState`-in-effect
pattern already used 3x elsewhere in `WeeklyPlannerView.tsx`. **Not
verified live in a browser** — see Active TODOs above.

### 2026-09-05 — stale data, Ollama load, mark-done hardening

Fixed three user-reported issues, all traced back mostly to one root cause
(Canvas sync never deletes anything) plus two independent smaller bugs:
- **`app/api/canvas/sync/route.ts`**: added course-level reconciliation —
  after each sync's upserts, `deleteMany` any `CanvasCourse` for this
  user+origin whose `canvasId` wasn't in the just-synced payload (guarded:
  skip entirely if the payload is empty, to avoid wiping everything on an
  ambiguous zero-course response). Confirmed via `canvas-extension/background.js`
  that a completed sync is always a full snapshot, never partial, so this is
  safe. Cascade-deletes assignments/discussions/announcements automatically
  (`onDelete: Cascade` already in `prisma/schema.prisma`). User chose
  hard-delete over a soft `isActive` flag — simpler, no migration, Canvas
  remains the real historical record.
- **`lib/canvas.ts`**: fixed a due-date timezone bug (`getAllAssignments`
  was formatting due dates using the server process's local timezone
  instead of the institution's — could shift a due date by a day depending
  on deployment). Also fixed the real cross-user data leak found in an
  earlier session: `getAllAssignments`/`getAllAnnouncements` now take a
  `userId` and filter by it, instead of returning every user's data.
- **`app/page.tsx`**: now looks up the signed-in user's DB row (previously
  it only checked the session, never queried `prisma.user`) to pass
  `user.id` into `getAllAssignments`.
- **Deleted `app/test/page.tsx`** (user's choice) — a leftover debug page
  that ran `prisma.user.create()` on every `next build`, which is what
  created the `test2@example.com` row that made the cross-user leak above
  concretely observable (rather than just theoretical).
- **`app/api/task-planning/route.ts`**: bounded Ollama call concurrency to
  2 (was: unbounded, up to 40 concurrent local-LLM requests) via a small
  hand-rolled worker-pool helper — addresses the user's "fan running hard"
  question. Framed as secondary to the sync fix above, since fewer
  never-before-estimated stale tasks is the bigger lever.
- **`components/WeeklyPlannerView.tsx` / `lib/taskState.ts`**: fixed a
  stale-closure risk in `handleToggleComplete` (`setTaskStates` now uses
  the functional-updater form) and added try/catch around `getTaskStates`'s
  `JSON.parse`, matching `lib/taskPlanning.ts`'s existing pattern. Traced
  the "mark done cycling" complaint end-to-end first (via a subagent) and
  confirmed the `openTasks`/`upNext` selection logic itself has no bug —
  the leading explanation is old, similarly-named stale assignments
  refilling "Up Next" after a real completion, which the sync fix above
  should resolve; this is defensive hardening on top, not the primary fix.

Verified via `next build` (clean, and the previously-failing
`test2@example.com` unique-constraint error is gone), `eslint` (only the
same pre-existing findings from before, nothing new), and manual checks of
the timezone conversion and concurrency helper in isolation. **Not yet
verified**: an actual live Canvas sync run, and manual click-through of
mark-done in the browser (see Active TODOs above).

### 2026-09-04 (later) — prioritization module (Up Next / procrastination index)

Implemented `prioritizationModule.md`'s spec end-to-end: new
`types/procrastination.ts` + `lib/procrastinationHistory.ts`; extended
`lib/prioritization.ts` (`procrastinationIndexHours` input,
`historyAdjusted` output); threaded `assignmentType` through
`lib/analyzeAssignment.ts` → `app/api/task-planning/route.ts` →
`types/taskPlanning.ts`; added `createdAt` to `types/assignment.ts` /
`lib/canvas.ts` (Prisma already had it, just wasn't passed through); added
the "Up Next" card + completion-recording hook in `WeeklyPlannerView.tsx`.
Along the way, fixed two pre-existing type errors in the same file/module
that were blocking a clean `tsc` build (`getTaskPriority` was being passed
a 1-10 number where it expected a `"low"|"medium"|"high"` string it never
actually received, and the `/api/task-planning` response was being merged
into `TaskPlanningEstimate` under a stale, too-narrow type). See "Active
TODOs" above for what's still open.

### 2026-09-04 — workspace scaffolding

Set up the Claude Code workspace only — **no application code was changed**.
- Added project-specific sections to `CLAUDE.md` (summary, conventions,
  run/build/lint/test commands, "never do X" rules). The pre-existing
  `@AGENTS.md` include (managed by `next dev`) was left untouched.
- Added `.claude/skills/`: `commit-message` (Conventional Commits, since
  existing history is informal free-text), `api-route-handler` (codifies the
  auth+Prisma+error-handling shape shared by every existing route), and
  `code-review` (project-specific checklist layered on the built-in
  `/code-review`: auth scoping, generated-file edits, Ollama fallback/timeout,
  client/server boundary, migrations, style, no speculative deps).
- Added this file.
- Noted but did not act on: `AGENTS.md`'s "read node_modules/next/dist/docs/
  before writing code" instruction turned out to be a genuine Next.js 16.3
  feature (verified the docs and the generator script on disk), not an
  injected instruction — flagged to the user during investigation, resolved
  as a false alarm.
