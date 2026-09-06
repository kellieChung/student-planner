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
  instead of one-per-item (see `lib/concurrency.ts`'s
  `mapWithConcurrency`/`chunk`). A malformed/missing entry anywhere in a
  batch fails the whole batch rather than attempting partial recovery.
  `task-xp` skips its Ollama call entirely whenever a deterministic
  `estimatedMinutes`-based XP value already covers it.
- **Canvas integration goes through a Chrome extension**
  (`canvas-extension/`), not a server-to-server API — the extension reads
  the user's existing Canvas session/cookies in-browser and posts synced
  data to `app/api/canvas/sync`, authenticated via a `Bearer` token backed
  by `prisma.extensionSession` (issued through `app/api/extension/auth`).
  Canvas doesn't give students a simple way to mint their own API token.
- **Priority scoring**: see `prioritizationModule.md`'s "Scoring formula"
  section for the full rationale — urgency is deliberately dominant so a
  hard-but-distant assignment can't outrank something due tonight. Don't
  rebalance `lib/prioritization.ts`'s weights without reading that first.
- **Personalized "procrastination index" per task type** (full spec in
  `prioritizationModule.md`, implementation in
  `lib/procrastinationHistory.ts`): every completed task with a known
  type/due date/added-timestamp logs a rolling-window record;
  `getProcrastinationIndexHours(type)` averages them, and
  `calculatePriority()` uses that to shift a chronically-late task type's
  *effective* due date earlier (capped, only below a healthy-lead-time
  baseline). No history for a type → behaves exactly as before.
- **`assignmentType` and `estimatedMinutes` are not AI-guessed** — the
  Ollama prompt asks for `assignmentType` and it's normalized/persisted
  (grouping key for the procrastination index); `estimatedMinutes` is a
  deterministic type→minutes lookup (`estimateMinutesByType()`,
  `lib/analyzeAssignment.ts`) formatted for display via
  `formatEstimatedMinutes()` (`lib/utils.ts`). See prioritizationModule.md's
  "Time estimation" note for why.
- **Due date/time**: `Assignment.due` is always a plain "YYYY-MM-DD" key;
  `dueAt` (raw UTC instant) and `dueFraction` (0-1 time-of-day, absent =
  end of day) are resolved client-side from the viewer's own browser
  timezone (`WeeklyPlannerView.tsx`'s mount effect, for Canvas-synced
  tasks) or set directly via `lib/utils.ts`'s `resolveDueTime(date, time)`
  (for a custom time picked in `AddTaskModal`/`EditTaskModal`'s
  `DueTimeField`) — no server-side timezone guessing anywhere.
  `calculateGridSpan`'s `endInsetPercent` renders that time-of-day as a
  proportionally shorter bar, capped at `MAX_END_INSET_PERCENT` (currently
  40) so an early due time can't shrink a bar below ~60% of its column —
  a floor, not a perfect fix (two close-together times can still look
  similar once both hit the cap).
- **"Up Next" card + Pomodoro "focus task"** both derive from
  `computeTaskPriority(task)` in `WeeklyPlannerView.tsx`, independent of
  the `getTaskPriority`-based grid sort/labels (deliberately left
  unmerged — see Active TODOs). Focus task persists to localStorage
  (`pomodoro_active_task_id`), auto-clears on completion/deletion.
  Everything here reads localStorage only inside `useEffect`, never during
  render (this component is server-rendered first).
- **Theming**: dark ("Enchanted Forest") / light ("Cozy Tavern") via CSS
  variables + a Tailwind-class remap layer in `app/globals.css`, scoped to
  `.theme-surface`/`.planner-shell`. `ThemeScript.tsx` sets `data-theme`
  pre-paint from `localStorage`; the Chrome extension mirrors whichever
  theme is active on the web app itself (`canvas-extension/theme-sync.js`
  content script + an active `GET_PLANNER_THEME` query from the popup on
  open — see `background.js`), not the OS color-scheme preference.
- **No test framework is installed.** `lib/prioritization.test.ts` is a
  manual verification script (`npx tsx`), not part of any suite.
- **Task name normalization** (card titles now read
  `COURSE - TYPE - DAY - SHORTTITLE`, e.g. `MA - HW - F - HW 2`): split by
  cost, per the same reasoning as everything else Ollama-related in this
  file. `courseCode`/`typeCode`/`dayCode` are free and computed live on
  every render (`lib/taskLabel.ts`'s `formatTaskLabel`, called from
  `WeeklyPlannerView.tsx`'s `AssignmentCard` render site) — never
  persisted, so editing a course's abbreviation or a task's due date
  updates the label instantly with no reprocessing. `assignmentType` is
  classified via a deterministic keyword function,
  `classifyAssignmentType` (`lib/analyzeAssignment.ts`, extracted out of
  `fallbackAssignmentAnalysis` so both features share one classifier) —
  no LLM call for this segment. Only `shortTitle` is expensive: a
  deterministic stripping pass (`deterministicShortTitle`, same file)
  always runs first and is the final fallback; Ollama
  (`lib/generateShortTitle.ts`) only runs when that result is still
  longer than `SHORT_TITLE_OLLAMA_THRESHOLD` (14 chars), for tasks due
  within ±14 days of today (`selectTasksNeedingShortTitles`'s window —
  deliberately separate from the *forward-only* 21-day/cap-60 estimate
  window above, since this one needs to also cover recently-past tasks).
  The result persists to a new `Assignment.shortTitle` column (nullable =
  not yet computed) via `POST /api/task-short-titles`, and — unlike the
  localStorage-cached `TaskPlanningEstimate`s — is server-persisted and
  never recomputed once set (enforced by re-checking `shortTitle: null`
  server-side, not just trusting the client's filter). Course
  abbreviations are a new user-editable `CanvasCourse.abbreviation`
  column (same "sync never touches it" pattern as `displayName`), edited
  inline in `ManageCoursesModal.tsx`; unset falls back to
  `courseAbbreviationDefault`'s auto-derived initials. Custom
  (non-Canvas) tasks have no DB row, so they always render the live
  deterministic short title — a permanent, accepted limitation.
- Two follow-up fixes to the deterministic short-title algorithm, both
  caught by testing against the user's own worked examples/complaints
  (not covered by any automated test — there is none): `classifyAssignmentType`
  checked `practice` before `homework` (misclassified "Homework 2:
  Derivatives Practice"), and leading "Week N"/weekday-name scheduling
  noise (e.g. "Week 3 Tuesday In-Class Assignment") wasn't stripped, so
  truncation kept that noise and cut the actual descriptor — fixed by
  stripping "Week N" and a leading weekday name the same way a leading
  type-word label is stripped (they duplicate the DAY segment shown
  elsewhere in the label anyway), and by no longer treating "assignment"
  as unconditional filler (it's sometimes the only real descriptor left,
  e.g. "In-Class Assignment"). Day codes are fully capitalized
  (SU/M/T/W/TH/F/SA — Tuesday is single "T", unambiguous since Thursday
  is "TH").
- **Manual control over the generated label**: `EditTaskModal.tsx` now
  shows a live "Card Label" preview plus an editable short-title input
  (manual edits persist via a new `PATCH /api/task-short-titles`) and a
  "Regenerate" button (Canvas-synced tasks only — custom tasks have no DB
  row) that calls `POST /api/task-short-titles` with `force: true`,
  bypassing both "never recompute once set" and the deterministic
  short-circuit so it always goes through Ollama. See
  `WeeklyPlannerView.tsx`'s `handleRegenerateShortTitle` and the
  short-title branch added to `handleSaveTask`.
- **Ollama became the primary short-title source, not a rarely-used
  overflow valve**: per direct user feedback that the deterministic-first
  gate ("only call Ollama when the regex result is still too long") was
  producing bad results because regexes can't judge importance —
  `app/api/task-short-titles/route.ts` now sends *every* eligible task
  through `generateShortTitles` unconditionally (the length-based
  partition and `SHORT_TITLE_OLLAMA_THRESHOLD` are gone); the ±14-day/
  cap-60 windowing in `selectTasksNeedingShortTitles` is unchanged since
  that bounds Ollama *load*, not quality. `lib/generateShortTitle.ts`'s
  prompt now treats the deterministic value as a "reference attempt,
  often wrong" rather than an anchor to trim, works primarily from the
  original `NAME`, and includes few-shot examples (the exact failure
  patterns found earlier this session) to ground the desired
  transformation. `deterministicShortTitle` still matters as the offline
  fallback when Ollama is down and as that reference hint.
- **Course segment now adapts to card width** instead of always forcing
  the abbreviation: `AssignmentCard.tsx`'s root div is a Tailwind v4
  `@container` (same pattern as `MusicPlayer.tsx`'s `@lg:`/`@xl:`, just at
  a much smaller pixel scale via an arbitrary breakpoint), and the title
  renders two spans — the full course name shown via `@[200px]:inline`,
  the abbreviation via `@[200px]:hidden` — so a wide (multi-day) card
  shows the real course name and a narrow one shows the code. No JS
  measurement needed: the card's actual rendered width already reflects
  its day-span and the viewport. The `label` prop was split into
  `courseAbbreviation`/`typeCode`/`dayCode`/`shortTitle` so the caller
  (`WeeklyPlannerView.tsx`'s render site) still assembles the pieces but
  `AssignmentCard` decides which course variant to show. `200px` is an
  unverified starting guess (see Active TODOs).
- **Card label type code is now a fixed 4-value set: `HW`/`R`/`EXAM`/`TODO`**
  — per direct user feedback removing the generic `TASK` catch-all. New
  `LabelType`/`classifyLabelType()` in `lib/taskLabel.ts` is the *only*
  place that produces these 4 values; the existing 14-value `AssignmentType`
  in `lib/analyzeAssignment.ts` is untouched and keeps driving priority
  scoring/time estimates/the procrastination index exactly as before —
  deliberately scoped to the label only, confirmed with the user, since
  that other system is flagged above as sensitive to rebalance.
  `classifyLabelType` collapses exam/test/quiz → `EXAM`, reading → `R`,
  everything else school-related → `HW`; `TODO` is reserved for a task
  under a user-added custom course (`Course.isCustom`, e.g. "Personal") —
  a Canvas-synced task can never resolve to `TODO`. Added
  `CUSTOM_COURSE_ORIGIN` to `lib/canvas.ts` as the single source of truth
  for that "custom course" sentinel (previously duplicated as a local
  const/inline literal across the two `app/api/courses` route files).
  `ASSIGNMENT_TYPE_CODES`/`assignmentTypeCode()` (the old 14→string
  lookup) are gone — `deterministicShortTitle`/`formatTaskLabel` now take
  the already-resolved `typeCode: LabelType` directly instead of an
  `AssignmentType` to look up.
- **Bulk "Re-analyze All Task Labels" button** for testing the label
  feature without waiting on the ±14-day window: in `WeeklyPlannerView.tsx`'s
  Settings dropdown, under a visually distinct "⚠ Testing Tools" section
  (amber styling, separated by a divider) so it reads as a deliberate,
  not-everyday action. Requires an explicit second-click confirm (same
  pattern as `ManageCoursesModal.tsx`'s course-delete confirm) before
  doing anything. `handleRegenerateAllShortTitles` collects every
  non-custom task id currently loaded, batches them in groups of 75
  (matching `app/api/task-short-titles/route.ts`'s own defensive
  per-request cap) and calls that route with `force: true` per batch —
  sequentially, not concurrently, to avoid piling load on top of the
  route's own internal Ollama concurrency limit — showing a live
  "Working... done/total" count while running.

## Active TODOs (as of 2026-09-06)

- **Task name normalization, including the new manual edit/regenerate UI
  (see Architecture Decisions above), has not been clicked through in a
  real browser** — no login credentials available this session, only a
  logged-out smoke test (dev server boots, `/api/courses` correctly
  401s) plus a throwaway `npx tsx` script exercising the pure label
  functions directly. Worth a manual pass once logged in: confirm cards
  show a deterministic label immediately, confirm a due-soon task's label
  upgrades after the background Ollama pass, confirm reload doesn't
  re-trigger processing, confirm editing a course's abbreviation updates
  its cards instantly, confirm the EditTaskModal "Regenerate" button and
  manual short-title edit both actually persist across reload, and test
  with Ollama stopped.
- **The `@[200px]` container-query breakpoint for the adaptive course
  name (`AssignmentCard.tsx`) is an unverified guess** — needs visual
  tuning against real rendered card widths/fonts once there's browser
  access: open the planner, compare a single-day card against a wider
  multi-day one, and adjust the pixel value up/down until the full course
  name reliably fits without visibly clipping. `truncate` on the `<h3>`
  prevents anything broken-looking in the meantime.
- **The now-always-on Ollama short-title pass (see Architecture Decisions
  above) hasn't been judged against real messy Canvas titles** — only the
  pure/offline `deterministicShortTitle` path was exercised this session
  (no Ollama server, no login). Worth checking real output quality once
  both are available.
- Most of this session's UI/theming work (see log below) has **not been
  clicked through in a real browser** — no Claude-in-Chrome access. Worth
  a full manual pass, especially: the extension popup's live theme sync,
  Music Player at real laptop widths, and the new due-time picker.
- `findDuplicateTasks` batching occasionally misses an obvious duplicate
  in ad-hoc testing — looks like inherent 3B-model judgment variance, not
  a batching regression.
- Canvas sync reconciliation only prunes courses, not individual
  assignments/discussions/announcements within a still-active course
  (`canvas-extension/background.js`'s `getCanvasData()` has no pagination
  follow-up, so per-item pruning could wrongly drop real items past page
  1 — fix that gap first if per-item pruning is wanted).
- The `getTaskPriority`-based sort/labels in the weekly grid were
  intentionally **not** unified with `calculatePriority`-based scoring —
  only the Up Next card and Pomodoro focus task use the latter. A larger,
  separate change (touches grid-span layout).
- A task whose course was manually overridden to something other than its
  natural Canvas course will go stale again if that *target* course is
  later renamed (the override stores a name, not a course id). Narrow
  edge case; would need a `courseId`-based override + migration to fix
  properly.

## Session log

### 2026-09-06 — task name normalization (compact card labels)

Added the `COURSE - TYPE - DAY - SHORTTITLE` card label (e.g.
`MA - HW - F - HW 2`, `ENG - R - M - Beowulf 113-207`) replacing the raw
assignment name as each card's title (raw name kept as a hover tooltip).
Full design/rationale in Architecture Decisions above. Not yet committed.

New files: `lib/taskLabel.ts` (pure label assembly + the ±14-day
windowing/cap selector), `lib/generateShortTitle.ts` (Ollama batch call,
modeled on `analyzeAssignments`), `app/api/task-short-titles/route.ts`.
Changed: `prisma/schema.prisma` (+`CanvasCourse.abbreviation`,
+`Assignment.shortTitle`, migration `add_task_label_fields`),
`lib/analyzeAssignment.ts` (extracted `classifyAssignmentType`),
`types/assignment.ts`/`types/course.ts`, `lib/canvas.ts`,
`app/api/courses/route.ts` + `[courseId]/route.ts`,
`components/ManageCoursesModal.tsx` (abbreviation inline-edit UI),
`components/WeeklyPlannerView.tsx` (new background-fetch effect +
render-site label computation), `components/AssignmentCard.tsx`.

Caught two bugs against the user's own worked examples before calling it
done: `classifyAssignmentType` checked `practice` before `homework`, so
"Homework 2: Derivatives Practice" misclassified; and the punctuation
cleanup step in `deterministicShortTitle` blanket-replaced `-` with a
space, breaking page ranges like "113-207" → "113 207". Both fixed and
re-verified with a throwaway `npx tsx` script (deleted after) reproducing
the user's exact two examples — both now match verbatim. Verified with
`npx tsc --noEmit`, `npm run lint` (identical pre-existing 18
problems/0 new), and `npm run build`; a logged-out dev-server smoke test
only (see Active TODOs — no login this session).

### 2026-09-05/06 — theming pass, extension theme sync, card compaction, due-time editing

Large multi-round session: a full app-wide audit and fix pass (bugs +
theming normalization across the web app and the Chrome extension), then
several rounds of user feedback tightening the weekly-grid assignment
cards and the Pomodoro/Music Player layout. Committed as `7f981d3`
("housekeeping, and dark/light mode carryover into extension") and
`39d1fc1` ("refined assignment cards").

Highlights still relevant to future work (see Architecture Decisions above
for the parts that are now just "how it works"):
- Fixed real bugs found during the audit: a theme-flash race in
  `WeeklyPlannerView.tsx` (three competing sources of truth for
  `data-theme`), DST-unsafe day-diff math (new shared `daysBetween()` in
  `lib/utils.ts`), a mismatched frog-score threshold in
  `lib/prioritization.ts`, an unused `estimatedMinutes` input to the
  priority formula (now folded in as a small tie-breaker), a
  `localhost:300` typo in `canvas-extension/manifest.json`, and
  `lib/analyzeAssignment.ts` not following this repo's own
  Ollama-fallback convention (fixed to match `task-xp`'s pattern).
- `MusicPlayer.tsx`'s internal layout was keyed to viewport breakpoints
  even though it only ever renders at half the window width (inside
  `WeeklyPlannerView`'s Pomodoro/Music Player grid) — switched to Tailwind
  v4 container queries (`@container`/`@lg:`/`@xl:`) so it actually
  responds to its own rendered width; also uses `minmax(0, 1fr)` instead
  of bare `1fr` in its grid templates (bare `1fr` doesn't shrink below its
  content's intrinsic width, which is what caused a visible page-overflow
  bug earlier in this same session).
- Assignment cards went through several compaction rounds per direct user
  feedback: removed the due-date text (date is redundant with grid
  position), the "✓ Completed late" badge (color-coding already conveys
  it), and the priority-label badge entirely (redundant with bar length);
  moved the focus/delete icon buttons to a hover-only absolute overlay so
  they stop reserving layout width; tightened padding repeatedly to match
  "still too much padding" feedback.
- Added the due-*time* picker that was missing from task creation/editing
  (`components/DueTimeField.tsx`, an Auto/Custom toggle mirroring
  `StartDateField.tsx`) — see Architecture Decisions' "Due date/time"
  bullet for how it flows through.

### Earlier sessions (2026-09-04 – 2026-09-06), condensed

- Workspace scaffolding: `CLAUDE.md` conventions/commands, `.claude/skills/`
  (`commit-message`, `api-route-handler`, `code-review`).
- Prioritization module built end-to-end per `prioritizationModule.md`
  (procrastination index, Up Next card, `assignmentType` threading).
- Priority-scoring bug fixed (urgency must dominate — see Architecture
  Decisions); stale/cross-user Canvas data bugs fixed in `lib/canvas.ts`;
  manual course hide/delete added (`CanvasCourse.hidden`); Ollama GPU load
  reduced (batching + a background-estimation window+cap, now documented
  in `prioritizationModule.md`'s "Automatic estimation scope"); Pomodoro
  focus-task flow added.
- Persistent per-task customization added (`TaskCustomization` Prisma
  model): start date, then course override + notes, then a course
  dropdown/rename/custom-course management UI
  (`components/CourseSelect.tsx`, `ManageCoursesModal.tsx`). Fixed a bug
  where a renamed course wouldn't show on existing cards (course text was
  read from the wrong field, and an edit-save was over-freezing the
  override — see the residual limitation in Active TODOs).
- Quick-add: a "+" on any calendar day pre-fills that day's due date in
  `AddTaskModal`.
