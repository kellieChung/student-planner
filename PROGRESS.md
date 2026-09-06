# Progress log

Read this before starting work in this repo; update it before ending a
session. Keep entries short — this is a scratchpad for continuity, not
documentation (that's what `CLAUDE.md` and code comments are for).

## Architecture decisions

- **AI scoring runs against a local Ollama server**, not a hosted API. All
  4 call sites (`lib/analyzeAssignment.ts`, `lib/ai/analyzeAnnouncement.ts`,
  `lib/ai/findDuplicateTask.ts`, `app/api/task-xp/route.ts`) share one
  model (`qwen2.5:3b-instruct` — avoids Ollama swapping models in/out of
  GPU memory) and one pattern: `try/catch` → deterministic fallback,
  `AbortSignal.timeout(...)`, and batch multiple items into one call
  instead of one-per-item (each call resends the full instructional prompt
  regardless of batch size — see `lib/concurrency.ts`'s
  `mapWithConcurrency`/`chunk`). A malformed/missing entry anywhere in a
  batch fails the whole batch rather than attempting partial recovery.
  `task-xp` additionally skips its Ollama call entirely whenever a
  deterministic `estimatedMinutes`-based XP value is already available,
  since that value always wins over the AI's guess anyway.
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
- **`estimatedMinutes` is NOT AI-generated** — it wasted a call/prompt/output
  field and wasn't even used in `calculatePriority`'s scoring formula.
  `estimateMinutesByType()` (`lib/analyzeAssignment.ts`) is a deterministic
  type→minutes lookup used everywhere it's needed. A per-student historical
  estimator is the intended real version of this — not built yet (see
  `prioritizationModule.md`).
- **"Up Next" card + Pomodoro "focus task"** both derive from the same
  `computeTaskPriority(task)` helper in `WeeklyPlannerView.tsx` (factored
  out so they can't drift), independent of the `getTaskPriority`-based grid
  sort (deliberately left untouched — see Active TODOs). "Up Next" is a
  `useMemo` over all open tasks; the focus task is `activeFocusTaskId`
  (persisted to localStorage as `pomodoro_active_task_id`, selected from
  the Up Next card or a weekly-grid `AssignmentCard`, auto-cleared when
  that task is completed/deleted/hidden) passed down into
  `PomodoroTimer.tsx`. Procrastination indices feeding both are loaded via
  a `useEffect`, never read from `localStorage` during render — this
  component is server-rendered first and `localStorage` doesn't exist
  there; every localStorage read in this file follows that rule.
- **No test framework is installed.** `lib/prioritization.test.ts` is a
  manual verification script (run with `npx tsx`), not part of any suite —
  it now also has a synthetic (non-Ollama-dependent) demonstration of the
  procrastination adjustment, runnable even without Ollama up.

## Active TODOs (as of 2026-09-06)

- **Nothing is committed yet** — everything below passed `tsc`/`eslint`/
  `next build` but has not been clicked through in a live browser. Worth a
  full manual pass: real Canvas re-sync (confirm inactive courses actually
  disappear — stale rows already in Postgres won't clear until a sync
  runs), the "📚 Courses" hide/delete manager, adding+completing a task
  (confirm `procrastination_history` grows and a same-type task gets
  bumped up next time), the "🧠 Estimating N tasks..." indicator, the
  Pomodoro focus-task flow (select from Up Next / a grid card, confirm it
  clears on completion, confirm GPU load is actually lower with the real
  197-assignment backlog), and the new task start-date feature (see below —
  DB round-trip verified directly against Postgres, but never clicked
  through in a browser; no Claude in Chrome access this session).
- `findDuplicateTasks` batching occasionally misses an obvious duplicate in
  ad-hoc testing — looks like inherent 3B-model judgment variance, not a
  batching regression, but worth a second look if duplicate-detection
  quality seems to have dropped.
- Canvas sync reconciliation only prunes courses, not individual
  assignments/discussions/announcements within a still-active course
  (deliberate scope trim — `canvas-extension/background.js`'s
  `getCanvasData()` has no pagination follow-up, so per-item pruning could
  wrongly drop real assignments past page 1; fix that gap first if
  per-item pruning is wanted).
- The `getTaskPriority`-based sort/labels in the weekly grid were
  intentionally **not** replaced with `calculatePriority`-based scoring —
  only the Up Next card and the Pomodoro focus task use it. Unifying the
  grid sort too is a separate, larger change (touches grid-span layout).

## Session log

### 2026-09-06 (latest) — cap automatic Ollama estimation load

User reported their machine heating up from Ollama load. Root cause: the
estimation `useEffect` in `WeeklyPlannerView.tsx` had no due-date or count
filtering — with a 150-197 assignment backlog, and the effect re-firing
every time `taskPlanning` updates (which happens after every response),
this cascaded through the *entire* backlog in back-to-back
`POST /api/task-planning` calls, each running real batched Ollama
inference. The server's existing `.slice(0, 40)` in that route was just a
per-request safety net, not a real cap on total volume.

- New `selectTasksNeedingEstimates()` (`lib/taskPlanning.ts`) replaces the
  old unfiltered `tasks.filter(...)` in that effect: only tasks due within
  a 21-day window are eligible (tasks with no due date at all are now
  **never** auto-estimated — no date to window/rank them by; documented
  as a deliberate trade-off in `prioritizationModule.md`, not left as a
  silent code decision), and even within that window the result is capped
  at 60, soonest-due first, as a hard backstop independent of how tasks
  happen to cluster in time. Numbers chosen with the user: "above 50" was
  the hard requirement, 60 is a clean multiple of the route's existing
  `ANALYSIS_BATCH_SIZE = 5` (12 batches instead of ~30-40) and a ~60% cut
  from the ~150-task baseline.
- **Bumped `app/api/task-planning/route.ts`'s defensive `.slice(0, 40)` to
  `.slice(0, 75)`** — left at 40, it would've silently truncated the new
  60-task capped request back down every time, leaving ~20 tasks that
  never get a cached signature and recreating the exact same cascading-
  request problem for that remainder. This was a real latent bug the fix
  would have walked straight into.

Verified: `tsc`/`eslint`/`next build` clean (no new findings vs. the
established baseline). Ran a synthetic check (100 tasks: 70 near-term, 20
far-future, 10 no-due-date) confirming `selectTasksNeedingEstimates`
returns exactly 60, all near-term, none far-future or no-due-date, and
that already-cached (matching-signature) tasks are correctly excluded.
**Could not observe actual Ollama/CPU load from here** — no way to run
Ollama or watch system load in this environment; the user should confirm
the "🧠 Estimating N tasks..." indicator now tops out around 60 instead of
climbing through the whole backlog, and that the machine actually runs
cooler.

### 2026-09-06 (still later) — quick-add task from any calendar day

Added a small "+" button to every day, so adding a task due that day
doesn't require the main "+ Add Task" button then manually picking the
date. Weekly view: next to each day-of-week header. Monthly view: in each
day cell's corner (hover-revealed, since those cells are small and already
crowded with up to 3 tasks + a "+N more" line).

- `AddTaskModal.tsx` gained an optional `defaultDue?: string` prop and a
  `useEffect` that resets the Due Date field to it whenever the modal
  opens (`[isOpen, defaultDue]`) — needed because the same modal instance
  is now opened from several different buttons that should each seed a
  different (or no) due date. This is the same "sync local form state from
  a prop via effect" pattern `EditTaskModal.tsx` already uses for its own
  fields, so it adds one more instance of this repo's already-accepted
  `react-hooks/set-state-in-effect` lint finding rather than a new kind of
  issue (confirmed via the same `git stash` baseline-diff technique as
  prior sessions: 23 problems/17 errors after, vs. 22/16 before, and the
  one new instance is exactly this).
- `WeeklyPlannerView.tsx`: `days` (the weekly header array) now also
  carries a `dateKey` (via the existing `toDateKey()` helper already used
  by the monthly view) so its new per-day button can pass the right date.
  New `openAddTask()`/`openAddTaskForDate(dateKey)` helpers wrap
  `setIsModalOpen(true)`, the latter also setting a new `quickAddDueDate`
  state that's passed into `AddTaskModal` as `defaultDue`; the main
  "+ Add Task" button now calls `openAddTask()` (which clears
  `quickAddDueDate`) instead of setting `isModalOpen` directly, so it
  never accidentally inherits a date from a previous per-day click.

Verified: `tsc`/`eslint`/`next build` clean (lint delta explained above,
otherwise unchanged). Not clicked through in a browser this session
(still no Claude in Chrome access) — worth confirming both the weekly
per-day button and the monthly hover-reveal one open Add Task with the
right date pre-filled.

### 2026-09-06 (yet later) — fix: renamed courses not updating on cards

User-reported bug: renaming a course in "📚 Courses" didn't show up on any
task cards until you manually reselected that task's course in Edit Task
(then switched away and back). Two separate bugs, both fixed:

1. **`lib/canvas.ts`'s `getAllAssignments`** built every task's `course`
   field from `course.name`, never `course.displayName` — so the base
   course text for *every* Canvas-synced task was permanently stuck at
   whatever Canvas originally called it, even across a full page refresh.
   This is the primary bug; fixed by reading `course.displayName ?? course.name`,
   matching the same pattern already used in `app/api/courses/route.ts`.
2. **`WeeklyPlannerView.tsx`'s `handleSaveTask`** used to unconditionally
   freeze a `TaskCustomization.course` override to whatever was currently
   showing, on *every* Edit Task save — including saves that only touched
   the start date or notes. Once frozen, that task's course would never
   pick up a later rename again (the exact "switch away and back"
   workaround the user found: reselecting the course re-freezes the
   override to the current, correct name). Fixed by only writing a course
   override when the saved value actually differs from what was
   previously effectively shown (`current override ?? the task's raw base
   course`), so unrelated saves no longer silently pin a task's course.

Residual limitation (not fixed, and not worth the schema rework right
now): a task whose course *was* deliberately overridden to a different
course than its natural one will still go stale if that target course is
renamed later, since the override stores a frozen name string, not a
course id. Fixing that for good would mean storing a `courseId` reference
on `TaskCustomization` instead — flagged as a possible future TODO, not
done here since it's a narrower case and would need a data migration for
whatever override rows already exist.

Did **not** touch any existing `TaskCustomization` rows already frozen by
the old buggy `handleSaveTask` — couldn't safely tell an accidental freeze
apart from an intentional recategorization after the fact, so left as a
one-time manual fix (reselect the course once more) for any task already
affected; new saves won't reproduce the bug.

Verified: `tsc`/`eslint`/`next build` clean, lint output unchanged from
the established baseline (22 problems/16 errors/6 warnings). Not clicked
through in a browser this session either (still no Claude in Chrome
access) — the user should confirm renaming a course now updates cards
immediately after this fix, with no manual per-task workaround needed.

### 2026-09-06 (even later) — course dropdown + manageable course list

Replaced the task modals' free-text "Course / Category" input with a
dropdown, and extended course management beyond the existing hide/delete
to include renaming and adding non-Canvas ("custom") courses.

- **Found and fixed a latent bug while doing this**: `app/api/canvas/sync/route.ts`'s
  course upsert always overwrites `CanvasCourse.name` from Canvas on every
  sync — unlike `hidden`, which the upsert never touches. So a naive rename
  (writing straight to `name`) would've silently reverted on the next sync.
  Fixed the same way `hidden` was: a new `CanvasCourse.displayName String?`
  column (migration `20260906020805_add_course_display_name`) that sync
  never writes to; display value everywhere is `displayName ?? name`.
  Verified directly against the dev DB with a simulated re-sync (`update: { name: ... }`,
  exactly what the sync route does) — the `displayName` survived.
- **Custom (non-Canvas) courses** are just ordinary `CanvasCourse` rows
  with a sentinel `canvasOrigin: "custom"` and a random `canvasId`
  (`crypto.randomUUID()`) — no schema change needed for this part, since
  the existing `@@unique([userId, canvasOrigin, canvasId])` already can't
  collide with a real Canvas instance URL. `isCustom` is computed
  (`canvasOrigin === "custom"`) rather than stored.
- `app/api/courses/route.ts` gained `POST` (create a custom course);
  `app/api/courses/[courseId]/route.ts`'s `PATCH` now independently accepts
  `hidden` and/or `name` (writes to `displayName`) so the hide-toggle and a
  new rename control don't clobber each other.
- New shared `types/course.ts` (`Course` type, replacing
  `ManageCoursesModal.tsx`'s locally-defined one) and
  `components/CourseSelect.tsx` — a `<select>` used by both
  `EditTaskModal.tsx`/`AddTaskModal.tsx` in place of the old text input,
  with a trailing "+ Add new course..." option that creates a course
  inline (`POST /api/courses`) without leaving the task modal. It always
  includes the task's current course as a fallback option even if it's not
  in the list (legacy free-typed text, or a since-deleted course), so nothing
  goes blank. `course` itself is still just a plain string everywhere
  downstream (`TaskCustomization.course`, a custom task's own `course`) —
  this only changed how that string gets picked, not its representation.
- `ManageCoursesModal.tsx` gained an "+ Add Course" input and a per-row
  rename control (pencil → inline text input); its delete-confirmation
  copy now differs for `isCustom` courses ("permanent" vs. "comes back on
  next sync").
- `WeeklyPlannerView.tsx` gained a `courses` state (fetched alongside the
  existing task-customizations fetch on mount) and a `refetchCourses()`
  helper, called both on mount and from `ManageCoursesModal`'s `onChanged`
  so a rename/add/delete there shows up in the task modals' dropdown
  without a full reload.

Verified: `tsc`/`eslint`/`next build` clean — confirmed via the same
`git stash` diff technique used in prior sessions that the lint output is
byte-for-byte the original pre-session baseline (22 problems/16 errors/6
warnings), i.e. this change introduced zero new lint findings (caught and
fixed two unescaped-apostrophe errors in `ManageCoursesModal.tsx`'s new
copy along the way). Verified create/rename/re-sync-safety/delete directly
against the real dev DB (see above). Confirmed `GET`/`POST /api/courses`
and `PATCH /api/courses/[courseId]` all still 401 without a session.
**Not clicked through in a browser** — still no Claude in Chrome access
this session; someone should manually verify the dropdown, the inline
"+ Add new course" flow, and that renaming a course in "📚 Courses"
immediately updates what the task modals show.

### 2026-09-06 (later) — auto start date toggle, editable course, notes

Extended the `TaskCustomization` mechanism from earlier today with two more
nullable fields, `course` and `notes` (migration
`20260906015320_add_course_and_notes_to_task_customization`), plus a UI-only
"Auto" concept for start date — no new server-side idea, just a toggle over
the null-means-auto semantics that already existed.

- New shared `components/StartDateField.tsx` (Auto/Custom toggle + the date
  `<input>`, only shown in Custom mode) used by both `EditTaskModal.tsx` and
  `AddTaskModal.tsx`, replacing their bare date inputs — extracted once
  since the exact same stateful block would otherwise be duplicated.
- `course` override is written **only for Canvas-synced tasks** (id not
  `"custom-"`-prefixed) — custom tasks keep editing course via their
  existing whole-object `localStorage` write (`handleSaveTask` in
  `WeeklyPlannerView.tsx`), so there's never two sources of truth for a
  custom task's course. `WeeklyPlannerView.tsx` gained an `effectiveTasks`
  `useMemo` (course override layered over `task.course`) that
  `sortedTasks`/`openTasks`/`upNext`/`activeFocusTask`/the monthly view all
  now read from instead of raw `tasks` — the one place this merge happens,
  so `AssignmentCard`/the Up Next card/Pomodoro focus card all pick up an
  edited course for free via their existing `task.course` reads.
- `notes` has no pre-existing home (not on `types/assignment.ts`'s
  `Assignment`) — it's a `TaskCustomization`-only field for every task
  kind, shown as a textarea in both modals (per the user's explicit ask,
  only inside the modal — not on the card face).
- `taskStartDates: Record<string, string>` generalized into
  `taskCustomizations: Record<string, { startAt; course; notes }>`;
  `persistStartDate` generalized into `persistCustomization` (same
  optimistic-update-then-fire-and-forget-`PATCH` shape). `GET`/`PATCH
  /api/task-customizations[/[taskId]]` extended accordingly — the `PATCH`
  route still expects all three fields together in one call (no
  partial-update logic) since every caller already sends all three from a
  single modal submit.

Verified: `tsc`/`eslint`/`next build` clean (same 4 pre-existing
`set-state-in-effect` findings, line numbers shifted, confirmed via
`git stash` diff same as last session). Verified the exact upsert/read/
clear-to-null the routes use round-trips `startAt`+`course`+`notes`
correctly against the real dev DB (`kelliecpiano@gmail.com`, throwaway row
cleaned up after). Confirmed both routes still 401 with no session.
**Not clicked through in a browser** — still no Claude in Chrome access
this session; someone should manually verify the Auto/Custom toggle shows/
hides the date picker correctly, a Canvas assignment's edited course
survives a reload, and a saved note reappears next time its task is
opened.

### 2026-09-06 — persistent, user-editable task start date

Added the first DB-backed per-task customization: a "Start Date" field,
independent of Canvas's `dueAt`/the task's own `due`, that actually
persists to Postgres (previously **no** task edit persisted anywhere but
`localStorage`, not even for Canvas-synced assignments — see
`handleSaveTask`/`handleAddTask` in `WeeklyPlannerView.tsx`, unchanged for
every other field).

- New `TaskCustomization` Prisma model (migration
  `20260906014206_add_task_customization`): `{ userId, taskId, startAt }`,
  unique on `(userId, taskId)`. `taskId` is a free-form string (a Canvas
  `Assignment.id` cuid, or a client-generated `"custom-<timestamp>"` id) —
  deliberately **not** a foreign key into `Assignment`, so it works for
  custom tasks (which have no DB row at all) without a join, and so
  Canvas's re-sync upsert can never touch/clobber it (same reasoning as
  `CanvasCourse.hidden`). Dates are stored/read as UTC-midnight instants
  and round-tripped via `.toISOString().slice(0, 10)` — this is a plain
  calendar date the user picked in a `<input type="date">`, not a Canvas
  UTC instant, so none of `lib/canvas.ts`'s institution-timezone handling
  applies here.
- New routes: `GET /api/task-customizations` (list all of the current
  user's), `PATCH /api/task-customizations/[taskId]` (upsert one — has to
  be an upsert, not courses'-style `findFirst`-then-`update`, since "no row
  yet" is every task's normal starting state).
- `WeeklyPlannerView.tsx`: new `taskStartDates` state (same
  `Record<taskId, value>`-merged-at-render pattern as `taskStates`/
  `taskPlanning`, not stored on the `Assignment` type itself), fetched
  alongside the existing localStorage reads on mount. `calculateGridSpan`'s
  `startDate` input now prefers a real user-set value over the old
  `taskState?.completedAt` stand-in (kept as a fallback so already-completed
  tasks' existing visual span doesn't change). `handleSaveTask`/
  `handleAddTask` now also fire a `PATCH` when the start date changes
  (optimistic local update, fire-and-forget persist, matching
  `awardXpForTask`'s existing try/catch-and-continue style).
- `EditTaskModal.tsx` and `AddTaskModal.tsx` both gained a "Start Date"
  date input next to "Due Date", with a shared lightweight guard (start
  after due → inline error, Save/Add disabled) — no other validation
  exists in either form beyond that, matching their existing minimalism.

Verified: `tsc`/`eslint`/`next build` clean (the only lint errors present
are the 4 pre-existing `set-state-in-effect` findings already called out in
earlier sessions — confirmed identical count via `git stash`). Verified the
exact Prisma upsert/read the new routes use round-trips correctly against
the real dev DB (create → read back → delete a throwaway row under the
real signed-in user, `kelliecpiano@gmail.com` — *not* `subjack@gmail.com`,
which isn't a user in this DB, just this session's own identity metadata).
Confirmed `GET /api/task-customizations` 401s with no session. **Not
verified by clicking through the actual UI** — no Claude in Chrome access
this session (user declined the extension) and no other browser-automation
path was available; someone should click through this by hand before
trusting it fully (see Active TODOs).

### 2026-09-05 — priority fix, stale-data cleanup, course management, GPU reduction, Pomodoro focus

Five pieces of work, in order:

1. **Fixed the priority scoring bug**: urgency must dominate importance/
   difficulty/consequence, not just be weighted ~50/50 (a due-in-10-days
   project was outscoring a due-today task). See `prioritizationModule.md`'s
   "Scoring formula" section.
2. **Stale Canvas data + related fixes**, prompted by old/inactive courses
   never disappearing: `app/api/canvas/sync/route.ts` never deleted
   anything, so added course-level reconciliation (`deleteMany` anything
   not in the latest sync payload, guarded against an empty payload —
   confirmed via `canvas-extension/background.js` that a completed sync is
   always a full snapshot, never partial). Fixed a real cross-user data
   leak (`getAllAssignments`/`getAllAnnouncements` had no `userId` filter)
   and a due-date timezone bug (server-local instead of institution-local)
   in `lib/canvas.ts`. Deleted `app/test/page.tsx`, a leftover debug page
   whose `prisma.user.create()` on every build was the actual source of
   the leaked `test2@example.com` row. Bounded Ollama concurrency to 2 in
   `app/api/task-planning/route.ts` and hardened a stale-closure risk in
   `WeeklyPlannerView.tsx`'s `handleToggleComplete`.
3. **Manual course hide/delete** (`ManageCoursesModal.tsx`, "📚 Courses"
   button), since some teachers never conclude a course so it never drops
   out of Canvas's active list on its own. `CanvasCourse.hidden` flag
   (migration `20260905041240_add_course_hidden_flag`) + `app/api/courses/
   route.ts` + `[courseId]/route.ts`. Hiding survives re-sync (the sync
   upsert never touches `hidden`); deleting a still-Canvas-active course
   does not (documented in the UI copy).
4. **Reduced Ollama GPU usage** — see the "AI scoring" architecture bullet
   above for the resulting call pattern. Root causes: 197 real
   never-estimated assignments silently driving the automatic background
   estimation effect (zero UI indicator — now has one, "🧠 Estimating N
   tasks..."), plus a fully sequential N+M-call announcement-analysis
   pipeline (now batched). Mid-task, user redirected to drop AI-based time
   estimation entirely (see the `estimatedMinutes` bullet above).
5. **Pomodoro focus task** — see the "Up Next card + Pomodoro" bullet
   above.

Verified throughout: `tsc`, `eslint`, `next build` clean at every step
(only new lint finding was one unescaped-quotes JSX error, fixed
immediately; everything else was more instances of the same pre-existing
`set-state-in-effect` pattern already used elsewhere in
`WeeklyPlannerView.tsx`/`PomodoroTimer.tsx`). Batched Ollama functions
tested against the real local server with realistic data. The course
migration was applied against the real dev DB (`prisma migrate dev` +
manual `prisma generate` — the generate didn't trigger automatically this
time). **Nothing from today verified live in a browser yet** — see Active
TODOs.

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
