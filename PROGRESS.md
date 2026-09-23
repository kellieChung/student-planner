# Progress log

Read this before starting work in this repo; update it before ending a
session. Keep entries short — this is a scratchpad for continuity, not
documentation (that's what `CLAUDE.md` and code comments are for).

## Architecture decisions

**Auth: email/password + consent gate (2026-09-22)**
- Sessions are **JWT** (`auth.ts`), not database — Auth.js's Credentials
  provider can't use DB sessions. Switching logged everyone out once; the
  `Session` table is now unused. `ExtensionSession` bearer tokens are
  separate and unaffected. Because a JWT outlives a deleted user row,
  `app/login/page.tsx` checks the row exists before redirecting to `/`
  (otherwise `/` ↔ `/login` loops).
- Sign-up is a server action (`app/login/actions.ts`), not the Credentials
  provider (which only authenticates). Emails are trimmed+lowercased on
  both paths (`normalizeEmail`) since Postgres `@unique` is case-sensitive.
  Passwords: `lib/password.ts`, Node `crypto.scrypt` + per-user salt,
  `scrypt$salt$hash` format, 8–128 chars, no composition rules (NIST).
- **Sign-up never attaches a password to an existing email** (e.g. a
  Google user) and `allowDangerousEmailAccountLinking` is deliberately off
  — with no email verification either would allow account takeover. Known
  consequence: someone can register another person's email first, which
  blocks that person's later Google sign-in (`OAuthAccountNotLinked`,
  surfaced on `/login`). Fix is email verification (TODO).
- Consent: `User.termsAcceptedAt/termsVersion/ageConfirmedAt`. Sign-up
  records them directly; Google users and pre-existing users are sent to
  `/accept-terms` by `hasAcceptedCurrentTerms` checks in `app/page.tsx`
  and `app/extension-callback/page.tsx`. **Bump `TERMS_VERSION` in
  `lib/legal.ts`** to re-prompt everyone after a material policy change.
  13+ age gate (COPPA) with an explanatory message; declining on
  `/accept-terms` offers account deletion.
- `/terms` and `/privacy` are templates (operator: Kellie Chung) with `[CONTACT
  EMAIL]` placeholder (governing law: Nevada); the privacy page lists real data
  flows (Anthropic for announcements, Ollama, YouTube, Vercel, DB host) —
  keep it in sync when adding a new third party.
- Account deletion: `DELETE /api/account` (every User relation cascades),
  triggered from `UserMenu`'s inline two-step confirm.

**Recurring tasks**
- `RecurringTask` (frequency/interval/weekdays/startDate/endDate/dueTime/
  typeOverride, all plain strings, no enums — matches `TaskCustomization`)
  is the template; occurrences are **materialized as real `CustomTask`
  rows** (`CustomTask.recurrenceId` FK, `onDelete: SetNull`), not expanded
  virtually — the planner loads all tasks once on mount and never
  refetches per week, so a virtual-occurrence design would force every
  `id.startsWith("custom-")` call site to special-case "is this a real
  row." Deterministic occurrence ids (`custom-r<recurringTaskId>-<due>`)
  make repeated materialization passes (mount, a second tab, a resumed
  series) safe no-ops (`app/api/recurring-tasks/[id]/occurrences/route.ts`).
- Materialization runs **client-side**, not server — `WeeklyPlannerView
  .tsx`'s `materializeRecurringTasks()` (mount effect, gated on
  `customTasksLoaded`) computes occurrence dates via `lib/recurrence.ts`'s
  pure `expandOccurrences`, resolves each via `lib/utils.ts`'s
  `resolveDueTime` (explicitly browser-timezone-dependent), then POSTs —
  the server route only re-validates/persists. Rolling 8-week horizon
  (`RECURRENCE_HORIZON_WEEKS`), re-extended on every mount — no background
  job, so navigating further ahead in one sitting shows empty weeks until
  the next reload.
- Deleting a single occurrence is a `TaskCustomization` **tombstone, not a
  hard delete**, even though its id starts with `"custom-"` — a hard
  delete would get silently resurrected by the next materialization pass
  (its only idempotency check is "does a row already exist for this id").
  `handleDelete` branches on `task.recurrenceId` before the `custom-`
  prefix check for this reason.
- "This occurrence" vs "this and following" (`EditTaskModal.tsx`): a scope
  prompt only appears when name/course/type changed and the due *date*
  didn't (a date shift is always "this occurrence only"). "This and
  following" hits `PATCH /api/recurring-tasks/:id` with `applyFromDate`,
  updating the template and bulk-updating future occurrences except
  completed/individually-overridden ones (`recurrenceOverridden`, set on a
  single-occurrence edit). Deleting "this and following" reuses the same
  endpoint's `deleteFrom` (shrinks `endDate`, bulk-tombstones forward).
- Real bug fixed: deleting a whole series correctly nulls a completed
  occurrence's `CustomTask.recurrenceId` server-side, but nothing
  refetched `/api/custom-tasks` client-side, so a stale local
  `recurrenceId` could still show a repeat-scope prompt for a series that
  no longer existed. Fixed via `refreshCustomTasks()` (re-syncs local
  tasks against the server, additive-only), called after every
  pause/resume/edit-pattern/delete.
- Live-verified end-to-end (weekly Tue/Thu series). Not verified live:
  monthly-frequency materialization (unit-tested only,
  `lib/recurrence.test.ts`), the AI-estimate-cloning simplification
  (never wired — see Active TODOs), a paused series producing zero new
  occurrences (toggle-state verified only).

**AI pipeline (Claude Haiku primary, Ollama fallback)**
- **2026-09-22: every AI call site now runs on Claude Haiku when
  `ANTHROPIC_API_KEY` is set** — on Vercel, local Ollama is unreachable,
  so the duplicate check was showing grey "unavailable" and assignment
  scoring was silently on its keyword fallback. Shared client/logging/
  error mapping in `lib/ai/anthropicClient.ts` (`logAnthropicUsage(label,
  …)` prints a `💰` per-call cost). XP (`task-xp`) no longer calls any
  model — purely time-based (`estimatedMinutes`, else
  `estimateMinutesByType(classifyAssignmentType(...))`).
- **Cost design (target ≤ ~$0.05/user/week; estimate ≈ $0.014)**:
  - `Announcement.aiAnalyzedHash` (sha256 of title+message,
    `computeAnnouncementContentHash`) — the detection pass skips any
    announcement whose hash matches, so unchanged text is never paid for
    twice (overlapping windows used to re-extract everything every run).
    Set only when extraction returned a real entry (`ok: true` from
    `analyzeAnnouncements`) AND no dup check for it was `degraded`;
    failures stay unmarked and retry. Legacy announcements (null hash but
    already have `AnnouncementSuggestionReview` rows) are backfilled
    without a model call — re-extracting them could re-word a task, change
    its `suggestionKey`, and resurface a prior "No". A run with nothing
    new skips the rate limit/event log entirely. Dry run returns
    `alreadyAnalyzedCount`.
  - Extraction batches 10 announcements per Haiku call (Ollama stays 5 —
    `getAnnouncementBatchSize()`); evidence is now a ≤20-word verbatim
    quote and description one sentence (output tokens cost 5× input).
  - Dup check is ONE call per extraction batch
    (`findDuplicateTasksForBatch`): each course's assignments listed once
    and numbered globally; a task may only match within its own course
    (cross-course number → `uncertainDuplicateResult`). Zero-token
    pre-pass: exact normalized name → high, containment (≥8 chars) →
    **medium at most** (high would let auto-accept silently suppress it).
    Never throws; a total failure degrades just the model-bound tasks.
  - Assignment scoring: 20 per Haiku call, compressed rubric, no `reason`
    output (stored as a fixed string — never displayed). Descriptions are
    now stripped/truncated (previously raw HTML into the prompt).
    `/api/task-planning` reuses any stored estimate whose signature still
    matches instead of re-billing it.
  - Prompt caching / Batches API deliberately not used: prompts are under
    Haiku 4.5's 4,096-token cache minimum, and Batches is async.
  - Known, accepted: a pending candidate's duplicate verdict isn't
    refreshed if a matching Canvas assignment appears after analysis.
- Shared config `lib/ollamaConfig.ts` (`OLLAMA_CHAT_URL`/`MODEL`/
  `NUM_CTX=8192` — added after a real outage where unbounded Canvas HTML
  blew the context window). The Ollama call sites share it, set `format: "json"`, wrap in `try/catch` → deterministic
  fallback with `AbortSignal.timeout`, batch via `lib/concurrency.ts`. Any
  HTML field from Canvas MUST go through `lib/htmlText.ts`'s
  `stripHtml`/`truncateText` before entering a prompt — this is the exact
  root cause of the outage above.
- Announcement extraction runs on Claude Haiku (`lib/ai/analyzeAnnouncement
  .ts` + `lib/anthropicConfig.ts`) when `ANTHROPIC_API_KEY` is set, via
  forced tool use; falls back to the Ollama implementation with zero code
  change when the key is unset (cost-cautious). A batch-level Anthropic
  failure retries via split-in-half bisection, not a flat N-way retry. The
  `RULES` block must be sent exactly once (system message only) — it was
  once accidentally duplicated into the user prompt too.
- The duplicate checker (`lib/ai/findDuplicateTask.ts`) is deliberately biased toward false positives **in
  code**: an unresolved/unknown match must stay flagged
  (`uncertainDuplicateResult`) rather than cleared. `checkStatus`
  distinguishes `"checked"` (a genuine verdict, including uncertain) from
  `"degraded"` (timeout/malformed/no assignments to compare) — only
  `"degraded"` maps to the grey "unavailable" UI state. Matches are
  resolved by a 1-based position number, not a retyped id (the 3B model
  mangles long ids).
- `OLLAMA_CONCURRENCY` caps **all** concurrent local calls system-wide,
  including duplicate-checks nested inside batch workers.
- Every date-window computation derives from `lib/utils.ts`'s shared
  `getStartOfWeek()` (Sunday-start) — a past bug had the announcement
  route's own Monday-start math silently disagree with the planner's
  "current week," pulling a whole week's wrong data.
  `ANNOUNCEMENT_BUFFER_DAYS = 4`.
- Accept/reject decisions persist via `AnnouncementSuggestionReview`,
  keyed by a content-derived `suggestionKey` (`lib/suggestionKey.ts`: sha256
  of announcement id + normalized name) — depends on `temperature: 0`
  determinism.
- `Announcement.course` is resolved via `displayName ?? name` (not the raw
  Canvas name) — a renamed course otherwise produces two different
  strings for the same course, breaking every downstream string-match.
- Canvas API pagination follows the `Link` header (`getNextPageUrl` in the
  extension) — a past bug silently lost everything past page 1 for a
  course with 100+ items.

**Auto Task Creation / Rundown screen** (`AutoTaskCreation.md`, implemented 2026-09-22)
- The old manual, one-at-a-time `AIReviewPanel`/`AIReviewCard` carousel is
  gone — replaced by a Rundown screen (`components/rundown/*`) shown
  automatically on app open (non-blocking, `OnboardingOverlay`'s "tour"
  pattern) whenever there's a pending AI candidate or a new Canvas
  assignment since `PlannerSettings.lastRundownViewedAt`. **The AI
  detection pass itself (extraction + duplicate-check) stays manually
  triggered** — opening the Rundown never fires an Anthropic/Ollama call;
  only `components/rundown/DetectionTriggerControls.tsx`'s "Check for new
  announcements" button does (ported near-verbatim from the old panel,
  including its custom-date-range picker and dry-run preview).
- `AnnouncementSuggestionReview.status` is now 4-way
  (`pending`/`accepted`/`rejected`/`maybe`, still a plain `String`, no DB
  enum) instead of just accepted/rejected — a row is now written for
  *every* detected candidate (`taskSnapshot` Json snapshot of the full
  `ProposedTask`), not just decided ones, so a "pending" candidate
  survives between sessions and a "maybe" one parks in the separate
  Still-Deciding surface (`components/rundown/StillDecidingPanel.tsx`,
  opened from a Taskbar badge, never auto-shown, not gated by
  `lastRundownViewedAt`). `app/api/ai/analyze-announcements/route.ts`'s
  `finalizeCandidates` is the single place that writes this — it also
  applies the new auto-accept setting (see below) before anything reaches
  the client.
- `ProposedTask["canvasMatch"]` gained `checkConfidence` (the duplicate
  check's own confidence, carried through on every branch including
  "none" — auto-accept gates on this, never on the extraction
  `confidence` field) and a `"unresolved"` status value for the
  out-of-range-match-number case (`isDuplicate: true` with a null
  `matchingAssignmentId`, produced only by `findDuplicateTask.ts`'s
  existing `uncertainDuplicateResult` — that function's hallucinated-id
  guard already existed, only the route's status mapping was missing this
  as a distinct bucket).
- New per-user singleton `PlannerSettings` (mirrors `TownState`'s
  pattern, deliberately not folded into it): `autoAcceptAiTasks` (default
  off, Taskbar settings popover toggle) and `lastRundownViewedAt`. When
  on, `lib/rundownAutoAccept.ts`'s `classifyAutoAction` auto-inserts a
  real `CustomTask` for a high-confidence non-duplicate and auto-suppresses
  a high-confidence duplicate, both server-side inside `finalizeCandidates`
  — neither ever reaches the stream/client. Anything else (medium/low
  confidence, or unresolved) always surfaces regardless of the setting.
- New `AiTaskEvent` durable log (free-form `data` Json per `type`) backs
  both the spec's accuracy-tracking logging requirement and the manual
  detection-pass rate limit (`lib/aiRateLimit.ts`: 2 real (non-dry-run)
  runs per rolling 7 days per user, bypassed for emails in the new
  `DEV_ACCOUNT_EMAILS` env var — not set anywhere yet, add it to `.env`
  and Vercel for any account that needs to bypass it).
- `CustomTask.aiTagDismissedAt` + `AssignmentCard`'s new 🤖 badge is the
  "AI-detected until dismissed" tag from the spec — dismissing it logs an
  implicit-confirmation event; deleting the task without dismissing first
  logs the opposite signal (both from the same `ai_task_deleted`/
  `ai_tag_dismissed` events, read off `existing.aiTagDismissedAt` at
  delete time).
- Known, accepted edge case (documented, not solved): a Canvas course
  restored via `restore-course` cascade-recreates its `Assignment` rows
  with fresh `createdAt`, which would show them as "new" again in "Added
  from Canvas" — mitigated only by a `take: 200` cap in
  `/api/rundown-candidates`, same category as the existing hidden-course
  tombstone gap above.
- Real bug caught by a pre-completion review and fixed before landing: the
  duplicate-check `alreadyDecidedKeys` skip was gated on `!isCustomSelection`
  (inherited from the old panel's "custom mode lets you re-review" intent,
  predating auto-accept). With auto-accept ON, re-selecting an
  already-decided announcement in custom mode let `finalizeCandidates`
  silently re-decide it — flipping a user's explicit "No" into an
  auto-inserted task with zero visibility, and with it OFF, an already-
  "maybe"'d item could render in both "AI found these" and Still-Deciding
  at once. Fixed by checking `alreadyDecidedKeys` unconditionally in both
  modes — an already-decided candidate now never re-enters the pipeline,
  in exchange for dropping the old "custom mode re-review" affordance
  (not something `AutoTaskCreation.md` asks for, and directly at odds with
  its "decisions are sticky" intent).
- **Not live-verified this session** — only `tsc`/lint/`next build` clean.
  Needs a real click-through with actual Canvas announcements + local
  Ollama/Anthropic before trusting: the auto-accept insert/suppress
  branches, the rate limit's 429 path and reset-date display, the Rundown
  auto-show/no-auto-show-on-dismiss behavior, the Maybe → Still-Deciding
  round trip surviving a reload, and the AI-tag dismiss/delete event
  logging. The Prisma migration itself did apply cleanly against the
  shared prod/dev DB (backfilled 127 existing `AnnouncementSuggestionReview`
  rows' new `updatedAt` via `now()`).

**Priority / scheduling**
- Priority scoring (`prioritizationModule.md`'s "Scoring formula"):
  urgency is deliberately dominant — importance/difficulty/consequence/the
  "frog" bonus exist only to break ties among tasks of similar urgency,
  never to overcome a real urgency-tier difference. Don't rebalance
  `lib/prioritization.ts`'s weights without reading that spec first.
- Procrastination index per task type (`lib/procrastinationHistory.ts`)
  shifts a chronically-late type's effective due date earlier (capped).
  No history for a type = behaves as before.
- `assignmentType`/`estimatedMinutes` are not AI-guessed for the estimate
  itself — `assignmentType` is Ollama-provided (grouping key only);
  `estimatedMinutes` is a deterministic type→minutes lookup
  (`estimateMinutesByType`).
- `Assignment.due` is always plain `"YYYY-MM-DD"`; `dueAt`/`dueFraction`
  resolve client-side from the browser's own timezone — no server-side
  timezone guessing anywhere. `calculateGridSpan`'s due-time inset is
  capped (`MAX_END_INSET_PERCENT = 40`).
- "Up Next"/Pomodoro focus derive from `computeTaskPriority`, independent
  of the grid's chronological sort. A task with a future custom start
  date (`TaskCustomization.startAt > today`) can never auto-select as Up
  Next — implemented as a **gate on the final score** (forced to `0`),
  not a new weighted term (`prioritizationModule.md`'s "Start-date gate").
  An overdue due date always wins over a stale future `startAt`.
  `upNext`'s loop hard-excludes gated candidates; `activeFocusTask`
  (explicit user focus toggle) is deliberately left ungated.

**Weekly grid layout**
- Stacking is chronological (due date → time-of-day → course), not
  priority-bucketed; "no due date" keeps its own priority sort.
  `grid-flow-row` (not dense) — dense packing fights chronological order
  for multi-day bars.
- Layout uses absolute positioning + `packColumnOffsets` (a true skyline
  packer over pixel Y-offsets), not CSS Grid rows — Grid rows are shared
  across all 7 day columns, which caused real bugs (a wide bar stranding
  narrower items in the wrong "row"; a short completed card sharing a row
  with a tall card getting stuck at that height). Column `left`/`width`
  use `calc()` expressions matching the divider grid's exact math.
- Bar ordering: due-date ascending within each status group; completed
  and active bars each keep strict due-date order among themselves,
  gap-filling between the two groups is unconstrained. Single-day tasks
  pack before bars in a shared column. Known, not a bug: the packer is
  greedy first-fit, not maximum-density.
- A card sharing a stretched grid row needs `self-start` — Grid's default
  `align-items: stretch` re-inflates a shorter card otherwise.
- Completing a task never moves its position (explicit user request) — a
  short CSS pulse plays, nothing more. Completed cards render shrunk
  (`min-h-[24px]`) and dimmed (`opacity-55`).
- **Real bug fixed 2026-09-22**: every task appeared one day late on the
  grid (confirmed live: date number on the card was correct, but it sat
  under the wrong weekday column). Root cause: `app/page.tsx` (a Server
  Component, runs on Vercel's UTC clock) computed `getStartOfWeek()` and
  passed the resulting `Date` to `WeeklyPlannerView` as a `weekStartDate`
  prop; the component seeded `activeWeekStart`/`activeMonthStart` from it
  via `setHours(0,0,0,0)`. A `Date` is just an instant and survives the
  server→client hop fine, but `setHours`/`getDate`-style local getters
  re-derive the calendar day **in whatever timezone calls them** — so a
  midnight-UTC instant built server-side got re-read as the previous
  evening once the Pacific-timezone browser touched it, anchoring the
  week start one day early. Column placement itself
  (`calculateGridSpan`'s `daysBetween(due, activeWeekStart)`) stayed
  self-consistent with that wrong anchor, but `dayNames` (`["Sun", "Mon",
  ...]`) is a fixed positional array, not derived from the anchor's real
  weekday — so every real day's weekday **label** was one column off from
  its true date. This surfaced once the Canvas extension started pointing
  at Vercel (`3fb7e11`) instead of `localhost` (previously the dev server
  ran on the same Pacific machine as the browser, so no cross-timezone
  reinterpretation ever happened). Fixed by never crossing a
  server-constructed day-anchor `Date` to the client at all:
  `WeeklyPlannerView` now seeds `activeWeekStart`/`activeMonthStart` with
  an SSR-safe default and corrects them via a mount effect calling
  `getStartOfWeek()` client-side (same call the "Today" button already
  used) — `weekStartDate` was removed from `WeeklyPlannerProps` and
  `app/page.tsx` entirely. **Sharper corollary to the existing "no
  server-side timezone guessing" rule: never pass a `Date` across the
  server/client boundary as a day-anchor** — the instant is fine, but any
  local-getter re-derivation on the far side silently reinterprets it.
  **Known, related, NOT fixed in this pass** (same violation, different
  code path, no reported symptom, ruled out because the reported bug hits
  even untouched Canvas assignments): `getStartOfWeek()` called
  server-side in `app/api/ai/analyze-announcements/route.ts`;
  `getTodayString()` called server-side in
  `app/api/recurring-tasks/[id]/route.ts`; `.toISOString().slice(0, 10)`
  (UTC-based) used to serialize `startAt`/`completedAt` back to date keys
  in both `task-customizations` routes; `StartDateField.tsx`'s "today"
  quick-set button using `toISOString().slice(0,10)` instead of the
  shared `getTodayString()`.

**Task customization / persistence**
- A custom start date (`TaskCustomization.startAt`) auto-reverts to
  "auto" once it's in the past — applied at **read time only**
  (`hasCustomStartDatePassed` in `lib/utils.ts`, used by
  `WeeklyPlannerView.tsx`'s `resolveStartAt`), never persisted/cleared via
  a periodic PATCH. An earlier draft did use a `setInterval` PATCH and was
  caught by review as the same "stale full-row PATCH from an in-memory
  snapshot" bug class fixed elsewhere — an idle second tab's timer would
  silently clobber whatever a different tab just changed. A `todayKey`
  state + 60s interval just forces a re-render on day rollover, no
  network call.
- All planner state is DB-backed per `(userId, taskId)` via
  `TaskCustomization`/`CustomTask`/`TaskPlanningEstimate`/
  `ProcrastinationRecord` — not one per-user JSON blob — so two
  browsers/tabs editing different tasks concurrently can't clobber each
  other. `persistCustomization`'s PATCH is a **full-row replace, not a
  server merge** — every caller must spread the current known
  customization before overriding its own field(s), or an unrelated save
  silently un-completes/un-deletes/un-overrides a task.
- Any task field is user-overridable via nullable `TaskCustomization`
  columns (`nameOverride`/`typeOverride`/`dueAtOverride`, plus the older
  `course` override) — only for Canvas-synced tasks; custom tasks store
  most fields directly **except type**: `typeOverride` is the only
  storage for a custom task's type too, unlike name/course/due. A past bug
  unconditionally zeroed `typeOverride` for any custom/AI-accepted task,
  silently discarding a type chosen in `EditTaskModal` — don't gate
  `typeOverride` on `isCustomTask`.
- `dueAtOverride` is a single nullable `DateTime` instant — no way to
  represent "override just the date, defer time-of-day" separately from
  "override to this exact instant." A past bug: `resolveDueTime` returns
  `dueAt: null` in "End of day"/auto mode, and the save handler used to
  diff only the raw `dueAt` instant, so a date change made in auto mode
  silently collapsed to "unset" and was dropped (masked by an optimistic
  local update, only reappearing as "the edit reverted" on reload). Fixed
  by diffing the *effective date* when the incoming `dueAt` is null, and
  synthesizing a concrete end-of-day instant (`endOfDayInstant()` in
  `lib/utils.ts`) so the date persists. Known cosmetic side effect:
  reopening a date-only-overridden task shows "Custom time 11:59 PM"
  instead of "End of day."
- `completedAt` must always be serialized as plain `"YYYY-MM-DD"`
  (matching `startAt`) — a full ISO instant here breaks
  `calculateGridSpan`'s `parseLocalDate` (a past bug produced `NaN` grid
  columns).
- Task status is 3-way (not_started/in_progress/completed), **derived**,
  not a persisted enum, via `lib/taskStatus.ts`'s `getTaskStatus` —
  avoids rewriting every existing boolean `completed` comparator.
- `pomodoro_state`/`pomodoro_active_task_id`/`planner_theme`/
  `music-player-volume`/`os_window_manager` stay localStorage-only on
  purpose — genuinely per-device, not account data.

**Card labels / courses**
- Card titles: `COURSE - TYPE - DAY - NAME` via `lib/taskLabel.ts`'s
  `formatTaskLabel`; `courseAbbreviation`/`typeCode`/`dayCode` are pure
  functions, never persisted. Course segment always shows the
  abbreviation unconditionally — a width-adaptive version was tried and
  reverted (read as an inconsistency bug, not a feature). Type code is a
  fixed 4-value set (`HW`/`R`/`EXAM`/`TODO`) via `classifyLabelType`,
  deliberately separate from the 14-value `AssignmentType` that still
  drives scoring/estimates/the procrastination index. `TODO` is reserved
  for a task under a user-added custom course (`Course.isCustom`;
  `CUSTOM_COURSE_ORIGIN` in `lib/canvas.ts`).
- Course abbreviation/color are user-editable `CanvasCourse` columns
  (sync never touches them), edited in `CoursesPanel.tsx`; unset falls
  back to deterministic name-hash defaults (`courseAbbreviationDefault`,
  `courseColorDefault` in `lib/courseColor.ts`).
- An AI-generated `shortTitle` label segment existed and was fully
  removed 2026-09-09 — nothing of it remains.
- Known, unfixed: a **hidden** Canvas course is as vulnerable as a
  deleted one to disappearing — sync pruning deletes any `CanvasCourse`
  missing from the latest payload regardless of its `hidden` flag.

**Canvas / extension**
- Canvas integration goes through `canvas-extension/` (reads session
  cookies in-browser, posts to `app/api/canvas/sync` via a `Bearer` token
  backed by `prisma.extensionSession`) — not server-to-server, since
  Canvas doesn't give students a way to mint their own token. The
  extension mirrors whichever theme is active on the web app itself.
- **Deletion exclusion**: `DELETE /api/courses/[courseId]` hard-deletes
  the `CanvasCourse` row (cascades to its Assignments/Discussions/
  Announcements) and upserts a `DeletedCanvasCourse` tombstone
  (`[userId, canvasOrigin, canvasId]`) — skipped for custom (non-Canvas)
  courses, which have no real `canvasId` to ever resync. `lib/canvasIngest
  .ts`'s `upsertCanvasCourses` (shared by `/api/canvas/sync` and
  `/api/canvas/restore-course`) checks this tombstone set before ever
  creating/updating a course. The course-delete + tombstone-upsert run
  inside one `prisma.$transaction` (hardening added 2026-09-21, not a
  proven fix for anything — see below). Only `/api/canvas/restore-course`
  (the extension's "Find Canvas Courses" → "Restore Course" flow, one
  course per call) ever removes a tombstone.
- Separately, `/api/canvas/sync`'s prune step deletes any `CanvasCourse`
  missing from that sync's payload — **no tombstone written**, by design,
  since a course dropping off Canvas's active list (unenrolled/concluded)
  is meant to be reversible, unlike an explicit user delete. This means a
  **hidden** course is equally vulnerable to disappearing tombstone-free
  if it drops off Canvas's list (`hidden` isn't checked here) — known,
  unaddressed.
- **2026-09-21 investigation**: user reported deleted courses reappearing
  after "Sync Canvas." Both the delete route and the sync-skip logic read
  as correct on direct inspection; root cause was never definitively
  isolated between two candidates (the tombstone-free prune path above,
  vs. `restore-course` being used on the same courses) — DB timestamp
  clustering favored the prune-path explanation but this wasn't proven. A
  live re-test (delete a fresh course → real "Sync Canvas" → confirmed it
  stayed gone) passed, so this is **resolved in practice**, not
  root-cause-confirmed — don't claim more certainty than that later.
- **Sync now skips already-excluded courses client-side, not just
  server-side** (2026-09-21): `GET /api/canvas/excluded-courses
  ?canvasOrigin=...` (same `getCanvasSyncUserId` auth as other
  extension-facing routes) returns the user's tombstoned `canvasId`s for
  an origin. `SYNC_CANVAS` in `background.js` calls this right after
  listing Canvas's active courses and before the per-course fetch loop
  (assignments/discussions/announcements), filtering them out — avoids
  spending a Canvas API round trip on data that would just get discarded
  server-side anyway. Fails open (syncs everything) on any lookup failure
  except a 401 (treated like any other stale-token case —
  `clearExtensionAuth()` + throw, since the sync POST would fail
  regardless). Skips the final POST entirely if every course ends up
  excluded, rather than sending an empty payload.
- **Deployment**: app is on Vercel (`https://student-planner-beta.vercel.app/`
  as of 2026-09-21, may change — check Vercel's dashboard), connected to
  `kellieChung/student-planner` on GitHub, auto-deploying on push to
  `main`. Env vars live in Vercel's dashboard, independent of the local,
  gitignored `.env` — a `git push` is required for any code change to go
  live, but not for env var changes. **Production and local dev currently
  share the same Postgres database** — no environment split, so local
  testing touches the exact rows the deployed app reads/writes. The
  extension's backend target is a configurable "App URL" popup setting
  (`chrome.storage.local`, key `appOrigin`, defaults to the deployed URL)
  rather than a hardcoded `localhost:3000`, so local dev and production
  both stay usable without code edits.

**Gamification / World layer** (`gamificationSystem.md`)
- OS loads by default, not World — per `projectReview.md`'s warning
  against burying the daily task list. `TownState` is a separate Prisma
  model from `GamificationState` (protects existing XP data from a shared
  blob-replace bug). `lib/townGrowth.ts` is framework-free. Currency
  earned always equals the same deterministic XP `/api/task-xp` computes
  — one reward economy. Mascot is Nano.
- **Streak mechanic removed entirely** (`currentStreak`/`longestStreak`/
  `graceTokens`/`lastGoodDay` and their update logic) per explicit user
  instruction — "goes against the principles of the game." Not replaced
  with a softer version; re-litigate with the user before adding one back.
  `TownState.kingdomStage` (village/town/city/kingdom) replaced those
  columns. Watchtower now grows from a flat `applyWatchtowerBonus` (+5) on
  any on-time completion, no consecutive-day tracking.
- Real sprite art (Toen's Medieval Strategy Sprite Pack, CC-BY 4.0) is
  wired into every building stage via `WorldLayoutData.buildingStageSprites`
  (`lib/spriteMap.ts`/`lib/spriteSheets.ts`, `components/world/TileSprite
  .tsx`) — `PixelBlock` (colored div + emoji) is gone from building
  rendering, still used for a couple of decorations with no sprite
  equivalent. `Building.tsx` takes a `stageSprites` prop rather than
  importing a static constant. Attribution lives on `/credits` (linked
  from the Taskbar's ⚙️ popover) — required by the CC-BY license; add any
  new sprite-pack asset there too. Multiple packs are supported via a code
  registry (`lib/spriteSheets.ts`'s `SPRITE_SHEETS`) — a new pack needs
  one registry entry, no other code changes.
- **Kingdom-wide stage is milestone-gated, not live** — per-building
  growth updates immediately on every matching completion, but the
  persisted `TownState.kingdomStage` only advances at a checkpoint
  (`maybeAdvanceKingdomStage`, every 5th completed task via
  `GamificationState.awardedTaskIds.length`), jumping straight to whatever
  stage is currently eligible — never step-advances, never regresses.
- Every field on `PATCH /api/town-state`/`/api/gamification` is genuinely
  optional (present-key validated, absent-key left alone) — hardened
  after three real bugs where a stale full-row PATCH built from an
  outdated snapshot silently overwrote `onboardingCompletedAt` or
  just-awarded currency/growth. Never reintroduce a "send the whole row"
  helper.
- **Gotcha for `awardXpForTask`-style code**: a `useState` functional
  updater passed to `setGamification`/`setTownState` is **not invoked
  synchronously at the call site** in this app (confirmed via direct
  instrumentation) — code that gates subsequent synchronous logic on a
  variable the updater was supposed to set is broken, since the updater
  hasn't run yet by then. `awardXpForTask` computes the dedup check and
  next state against `latestGamificationRef`/`latestTownStateRef` (kept
  synchronously up to date) fully outside any `setState` updater, then
  calls `setState` with a plain value purely to trigger a re-render.
- `LaptopFrame` keeps OS content always mounted; the inactive view is
  hidden via `invisible`, never unmounted — a "View Kingdom" toggle must
  not kill Pomodoro/Music playback or re-run mount-effect fetches.
  `PomodoroTimer`/`MusicPlayer` each publish live state via
  `PomodoroRemoteContext`/`MusicRemoteContext`, consumed by both the real
  OS window and the World's Hourglass/Bard panels (`MusicRemoteContext`
  deliberately excludes playlist create/import/add-track — not cleanly
  remote-controllable without a deeper rewrite).
- **The World map is user-designed data, not hardcoded arrays** — a
  `WorldLayout` Prisma model (`userId @unique`, one JSON `data` column,
  `types/worldLayout.ts`'s `WorldLayoutData`) holds ground theme, a
  freeform `decorations` list (forest/mountain/water/farmland/paths —
  hand-placed, since this sprite pack's road art is junction-shaped and
  any *computed* path looks wrong no matter how it's placed),
  `buildingStageSprites`, `scatterHouses` (growth-gated reveal), an
  optional `wall` (kingdomStage-gated), and freeform `extraBuildings`
  (user-placeable, additive to the 5 fixed growth buildings, which stay
  singleton). Edited via `/dev/map-editor`
  (`components/dev/MapEditor.tsx`) — a real, non-interactive `TownMap`
  preview with an interactive overlay on top (`pointer-events-none` on the
  preview so editor clicks never fire in-game buttons).
  `DEFAULT_WORLD_LAYOUT` (`lib/worldLayout.ts`) is what the old hardcoded
  constants used to be, ported 1:1 — a user who's never opened the editor
  sees zero visual change. A `TileRef` is either a catalog name or a raw
  sheet coordinate (`{kind:"named"}`/`{kind:"raw"}`), since the editor's
  picker allows any sheet cell, not just named ones.
- Placements are stored as **integer grid row/col**, not a percent of the
  container (`lib/mapGrid.ts`) — an earlier percent-based design only
  stayed grid-aligned at the exact container width it was computed
  against, so the editor and the real view (different widths) silently
  drifted off-grid from each other. Rendering is just
  `row * GROUND_TILE_PX`/`col * GROUND_TILE_PX`, identical everywhere by
  construction.
- **The map is a fixed-size logical frame, scaled-and-panned to fit any
  screen** — `lib/mapGrid.ts`'s `FRAME_COLS x FRAME_ROWS` (62x34: a
  `CONTENT_COLS x CONTENT_ROWS` 26x14 area `DEFAULT_WORLD_LAYOUT` was
  tuned against, plus a `MARGIN_COLS`/`MARGIN_ROWS` grass buffer) is the
  *entire* map; both the editor and the live "View Kingdom" screen render
  identical content through a shared `components/world/MapViewport.tsx`,
  which scales-to-fit rather than requiring matching container pixel
  dimensions. `MapViewport` also owns real pan/zoom (wheel-zoom-to-cursor,
  drag-to-pan, two-pointer pinch) — zoom-out is capped so the frame always
  *covers* the container (never "contain," which would letterbox with
  visible background), and pan is hard-clamped to the frame's true edge
  (no slack).
- Ground tuft scatter uses a real integer hash (`hashCell()`, Thomas
  Wang's 32-bit hash), not a small-modulus formula — an earlier
  `(row*7+col*13)%11` produced a visible diagonal stripe (small
  coefficients mod a small number don't mix enough). No `Math.random()`
  anywhere in map rendering — would reintroduce an SSR hydration mismatch.
- **Gotchas for anyone touching `MapViewport`/the editor again**:
  - Every interactive element rendered inside `MapViewport`'s transformed
    frame must call `stopPropagation()` on its own `pointerdown` (not just
    `onClick`) — `pointerdown`/`pointerup` and `click` are independent
    events from the same physical click. `MapViewport` starts a candidate
    pan gesture on any unopposed `pointerdown` and only commits once
    movement crosses `DRAG_THRESHOLD_PX`; a real mouse click almost always
    has a few incidental px of movement, which without this guard gets
    misread as a drag and swallows the element's own click.
  - Measuring the viewport's own size on mount must use
    `clientWidth`/`clientHeight` (layout-box), never
    `getBoundingClientRect()` (rendered-box) — `MapViewport` can first
    mount mid-`rotateX` during `LaptopFrame`'s lid-opening animation, and a
    `getBoundingClientRect()` read at that instant returns a wildly
    distorted size that then poisons the fit calculation for the entire
    mount's lifetime (a CSS transform never triggers `ResizeObserver`).
  - A conditionally-rendered UI panel (e.g. "Selected placement" edit
    controls) must never share document flow with a click target — its
    own appearance/disappearance reflows the canvas underneath it and
    turns the next click into a misclick. Solved with a
    `position: absolute` floating drawer instead of an in-flow sidebar.
  - A gesture-state bug that depends on the exact interleaving of two
    simultaneous pointers lifting (e.g. a pinch ending) won't show up in
    single-pointer testing — needs its own dedicated repro.
  - `Building.tsx`'s multi-tile sprites (`colSpan`/`rowSpan`) need the map
    editor's drag-handle sizing to match the sprite's real footprint, not
    a fixed guess — `buildingHandleSize()` computes this from
    `getSpriteRect()` across all 3 stages.

**OS window system** (`components/os/Window.tsx`, `WindowManagerContext.tsx`)
- Generic, app-agnostic window chrome for Pomodoro/Music/Courses —
  position/size/isOpen/isMinimized/zIndex live in `WindowManagerContext`,
  persisted to `os_window_manager`. Drag/resize gesture code builds fresh,
  non-memoized closures per-gesture rather than stable `useCallback`s (a
  `useCallback` referencing itself before its own declaration was a real
  recurring bug here).
- The resize grip's clickable area must NOT be clipped by the outer
  window's rounded corner — `overflow-hidden` lives on an inner wrapper
  (title bar + content), not the outer container, since a
  border-radius-minus-border-width clip removes most of a flush grip's
  hit area right where a user aims.
- Music window must stay mounted whenever `isOpen` regardless of
  minimized state, so audio keeps playing. Pomodoro's `onBeforeClose`
  force-writes a paused snapshot directly to localStorage (bypassing
  React) since `closeWindow`'s unmount lands in the same commit as a
  setState-based pause, and React drops pending updates for a component
  unmounted in that commit.
- `MusicPlayer`'s now-playing/tracks sub-grid needs its own `@container`
  scope, independent of the outer playlist-sidebar grid — otherwise both
  nested breakpoints trip off the same width and squeeze together on
  resize instead of laying out independently.

**Misc**
- Theming: dark ("Enchanted Forest")/light ("Cozy Tavern") via CSS
  variables + a Tailwind-class remap layer in `app/globals.css`, scoped
  to `.theme-surface`/`.planner-shell`; `ThemeScript.tsx` sets
  `data-theme` pre-paint from localStorage.
- `daysBetween()` (`lib/utils.ts`) is the shared DST-safe day-diff helper
  — a past bug used raw millisecond subtraction and got the wrong answer
  across a DST boundary; don't reintroduce manual date math for day
  differences.
- No test framework installed — `lib/prioritization.test.ts` is a manual
  `npx tsx` script, not part of any suite.

## Active TODOs

- **Legal pages are missing a contact email** — `/terms` and `/privacy`
  still show the literal `[CONTACT EMAIL]` placeholder in production
  (pushed 2026-09-22 without it). Replace once the custom-domain email
  exists; nothing else is left to fill in.
- AI cost pass (2026-09-22) — **blocked on applying the migration**:
  `prisma/migrations/20260923000000_add_announcement_ai_analyzed_hash`
  (one nullable column) was written but not applied; `npx prisma migrate
  deploy` + `npx prisma generate` were blocked from the agent session
  (shared prod DB). Until then `tsc` fails on `aiAnalyzedHash` and the
  code must not be pushed. Then live-verify: a dry run shows new vs.
  already-checked counts; a real run logs `💰` for extraction/dup
  check/scoring with amber/clean (not grey) dup states; an immediate
  second run makes zero Anthropic calls with pending candidates still
  visible; evidence highlight scrolls inside the announcement box only;
  XP awards with no model call. Compare real `💰` numbers to the
  ~$0.014/user/week estimate.

- Auth (2026-09-22): not live-verified in a browser — sign up (age/terms
  unchecked, short/mismatched password, duplicate email in other case),
  password sign-in/wrong password, Google → `/accept-terms`, extension
  login with a password, Delete Account. Only lint/build + page status
  codes + a hashing script were checked. Shared prod DB: use a test email
  and delete it after. Follow-ups: fill the legal-page placeholders and
  get them reviewed; email verification; password reset; rate-limit
  login/sign-up attempts. The consent gate covers pages only — existing
  extension Bearer tokens keep syncing via `/api/canvas/sync` until the
  user next opens `/`.

- Auto Task Creation / Rundown: not live-verified — see the dedicated
  architecture entry above for the exact list (auto-accept branches, rate
  limit 429/reset display, auto-show/dismiss gating, Maybe round trip,
  AI-tag dismiss/delete logging). Set `DEV_ACCOUNT_EMAILS` in `.env`/Vercel
  before relying on the rate-limit bypass for any account.
- Canvas: of the 4 courses that reappeared before the 2026-09-21 fix, 3
  have been re-deleted (English Student Aide Workshop, STEM Mentors
  26-27, World Language Center); Calculus III wasn't — confirm with the
  user whether that's intentional.
- Canvas: the `restore-course` flow ("Find Canvas Courses" → "Restore
  Course" in the extension) is still only tsc/lint/build-verified, not
  exercised live end-to-end (the 2026-09-21 live test covered delete+sync,
  not restore specifically).
- Canvas: sync reconciliation only prunes whole courses, not individual
  assignments/announcements within an active course. A task manually
  overridden to a non-Canvas course name goes stale again if that course
  is later renamed (override stores a name, not a course id).
- Recurring tasks: the "AI estimate cloning" simplification was never
  wired up — the real per-task `TaskPlanningEstimate`-trigger call site
  wasn't identified (likely `WeeklyPlannerView.tsx`'s estimate-loading
  effect or `app/api/task-planning/route.ts`). As written, a
  many-occurrence series fires one Ollama call per occurrence instead of
  cloning the first.
- Recurring tasks: monthly-frequency materialization and a paused series
  producing zero new occurrences are only unit/toggle-verified, not
  clicked through live. `EditTaskModal`'s "this and following" scope
  doesn't propagate a `dueTime` change (deliberate v1 cut).
- World map: the saved layout still sits left-of-center after the margin
  was widened — the bulk-recenter tool ("🎯 Center Content" in
  `/dev/map-editor`) fixes this in one click, but nobody has opened the
  editor and clicked Save since. The path tiles also still don't look
  great — the tool to redesign them by hand exists, nobody's done it yet.
- Sprite pipeline: no distinct "ruins" sprite located in the inspected
  rows of the sheet — may exist in unexamined rows, nothing currently
  needs it.
- Not a bug, don't "fix" again: the skyline packer's small unfilled gaps
  in a real week are expected (greedy first-fit, not maximum-density).
- Gamification: currency spend/shop UI and cosmetics are deliberately
  deferred. `announcementFound` mascot trigger has never fired against a
  real batch. Light-theme rendering of `WorldView`/`TownMap`/
  `OnboardingOverlay` and layout at very small widths are unchecked.
- Several features are verified only via `tsc`/lint/build, not click-tested
  live: `nameOverride` task-field override; loading indicators (XP award,
  course create/save, `MusicPlayer`'s `busyItemId`); most of the
  announcement-analysis polish list, now living in
  `components/rundown/RundownCandidateCard.tsx` (evidence highlighting/
  inline editing were live-verified pre-Rundown; auto-scroll to the
  highlight is back, scoped to the announcement box's own scrollTop —
  not scrollIntoView, which dragged the whole overlay — not yet
  live-verified;
  HTML-safe rendering, due-date resolution, persisted accept/reject, and
  "check unavailable" status were not live-verified even before the
  rewrite); AI-suggested-task course-matching; the announcement pipeline's
  reliability changes (RULES dedup, concurrency cap, bisection retry,
  degradation, number-based matching) haven't been re-exercised together
  against a live run since landing; the announcement time-range preset UI;
  the expired-start-date auto-revert's completed-task fallback and live
  day-rollover path; browser-local-state migration edge cases (second-
  browser sync, a custom task's PATCH round-trip, Canvas re-sync not
  resurrecting a deleted task); Taskbar's `Log Out` (would end the real
  session) and ~400px-width layout; music loop/shuffle end-of-track
  behavior (YouTube iframe never got past buffering in
  browser-automation).
- Untested, low-stakes: `opacity-55` completed-card dimming on light
  theme; a stray `ProcrastinationRecord` from old live testing was never
  cleaned up (no delete endpoint); Music window's track list has a fixed
  `max-h-[280px]`, doesn't grow with window resize.

---

Detailed session-by-session history (pre-2026-09-21) was compressed out
of this file on 2026-09-21 — the Architecture Decisions above retain the
current design and its load-bearing rationale. Use `git log` for exact
change history if needed.
