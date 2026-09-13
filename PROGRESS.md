# Progress log

Read this before starting work in this repo; update it before ending a
session. Keep entries short — this is a scratchpad for continuity, not
documentation (that's what `CLAUDE.md` and code comments are for).

## Architecture decisions

**AI / Ollama pipeline**
- Shared Ollama config in `lib/ollamaConfig.ts` (`OLLAMA_CHAT_URL`/`MODEL`/
  `NUM_CTX=8192` — added after a real outage where unbounded Canvas HTML
  blew the context window; nothing set this before). All 4 call sites
  (`analyzeAssignment.ts`, `analyzeAnnouncement.ts`, `findDuplicateTask.ts`,
  `task-xp/route.ts`) share it, set `format: "json"`, wrap in
  `try/catch` → deterministic fallback with `AbortSignal.timeout`, and
  batch via `lib/concurrency.ts` (`mapWithConcurrency`/`chunk`) instead of
  one-per-item. Batch-failure handling differs: `analyzeAssignment` fails
  the whole batch (caller retries per-item, has a fallback score);
  `analyzeAnnouncement`/`findDuplicateTask` degrade per-entry. `task-xp`
  skips Ollama entirely when a deterministic estimate already covers it.
  Any HTML field from Canvas MUST go through `lib/htmlText.ts`'s
  `stripHtml`/`truncateText` before entering a prompt — this is the exact
  root cause of the outage above; don't reintroduce raw HTML into a prompt.
- Announcement extraction runs on Claude Haiku (`lib/ai/analyzeAnnouncement.ts`
  + `lib/anthropicConfig.ts`) when `ANTHROPIC_API_KEY` is set, via forced
  tool use (no `JSON.parse` step); falls back to the Ollama implementation
  with zero code change when the key is unset (deliberate, cost-cautious
  capped API credit). A batch-level Anthropic failure retries via
  split-in-half bisection, not a flat N-way retry, to preserve batching
  benefit on partial failure. The `RULES` block must be sent exactly once
  (system message only) — it was once accidentally duplicated into the
  user prompt too, doubling cost.
- The duplicate checker (`lib/ai/findDuplicateTask.ts`) deliberately stays
  on local Ollama (runs ~5x more often, cheaper, already tuned) and is
  deliberately biased toward false positives **in code**, not just prompt
  wording — an unresolved/unknown match must stay flagged
  (`uncertainDuplicateResult`) rather than being cleared. `checkStatus`
  distinguishes `"checked"` (a genuine verdict, including an uncertain
  one) from `"degraded"` (timeout/malformed/no assignments to compare) —
  the route maps only `"degraded"` to the grey "unavailable" UI state;
  don't let a genuine verdict fall into that bucket. Assignment matches
  are resolved by a 1-based position number, not a retyped id — the 3B
  model mangles long ids when asked to retype them.
- `OLLAMA_CONCURRENCY` caps **all** concurrent local calls system-wide,
  including duplicate-checks nested inside batch workers (a past bug ran
  up to 10 concurrent calls despite the constant's name implying a lower
  cap).
- Every date-window computation in the app must derive from `lib/utils.ts`'s
  shared `getStartOfWeek()` (Sunday-start) — a past bug had the
  announcement route's own Monday-start math silently disagree with the
  planner's Sunday-start "current week," pulling a whole week's wrong
  data. `ANNOUNCEMENT_BUFFER_DAYS = 4` (lands on the prior Wednesday given
  a Sunday anchor).
- Accept/reject decisions persist via `AnnouncementSuggestionReview`, keyed
  by a content-derived `suggestionKey` (`lib/suggestionKey.ts`: sha256 of
  announcement id + normalized name) — depends on `temperature: 0`
  determinism; a re-extraction that rewords the same task's name could
  resurface a decided suggestion once (accepted limitation).
- `Announcement.course` is resolved via `displayName ?? name` (not the raw
  Canvas name) at the point it's built — a renamed course otherwise
  produces two different strings for the same course, breaking every
  downstream string-match (abbreviation/color/dropdown).

**Priority / scheduling**
- Priority scoring: see `prioritizationModule.md`'s "Scoring formula" —
  urgency is deliberately dominant. Don't rebalance `lib/prioritization.ts`'s
  weights without reading that first.
- Procrastination index per task type (`prioritizationModule.md`,
  `lib/procrastinationHistory.ts`) shifts a chronically-late type's
  effective due date earlier (capped). No history for a type = behaves as
  before.
- `assignmentType`/`estimatedMinutes` are not AI-guessed for the estimate
  itself — `assignmentType` is Ollama-provided (grouping key only);
  `estimatedMinutes` is a deterministic type→minutes lookup
  (`estimateMinutesByType`, `lib/analyzeAssignment.ts`).
- `Assignment.due` is always plain `"YYYY-MM-DD"`; `dueAt`/`dueFraction`
  resolve client-side from the browser's own timezone — no server-side
  timezone guessing anywhere. `calculateGridSpan`'s due-time inset is
  capped (`MAX_END_INSET_PERCENT = 40`) so an early time can't shrink a
  bar below ~60% width.
- "Up Next"/Pomodoro focus task derive from `computeTaskPriority` in
  `WeeklyPlannerView.tsx`, independent of the grid's own chronological sort.

**Weekly grid layout**
- Stacking is chronological (due date → time-of-day → course), not
  priority-bucketed; the "no due date" section keeps its own separate
  priority sort. `grid-flow-row` (not dense) — dense packing fights
  chronological order for multi-day bars.
- Layout uses absolute positioning + `packColumnOffsets` (a true skyline
  packer over pixel Y-offsets), not CSS Grid rows — Grid rows are shared
  across all 7 day columns, which caused two real bugs (a wide bar
  stranding narrower items in the wrong "row"; a short completed card
  sharing a row with a tall card getting stuck at the tall row's height).
  Column `left`/`width` use `calc()` expressions reproducing the divider
  grid's exact math — naive percentages drift out of alignment, worst at
  Fri/Sat.
- Bar ordering: due-date ascending (`columnEnd`) within each status group;
  completed bars and active bars each keep strict due-date order among
  themselves, but gap-filling between the two groups is unconstrained.
  Single-day tasks always pack before bars in a shared column. Known, not
  a bug: the packer is greedy first-fit, not maximum-density — small
  unfillable gaps in a real week are expected.
- A card sharing a stretched grid row needs `self-start` — Grid's default
  `align-items: stretch` silently re-inflates a shorter card's height
  otherwise.
- Completing a task never moves its position (explicit user request) — no
  completed-status sort tiebreak, only a short CSS pulse plays. Completed
  cards render shrunk (`min-h-[24px]`) and dimmed (`opacity-55`).

**Task customization / persistence**
- A custom start date (`TaskCustomization.startAt`) auto-reverts to "auto"
  (start = today) once it's in the past — the first *time-based* revert in
  the app; every other override's "back to auto" (the field's own Auto
  button, course color's Reset) is manual/user-initiated.
  `hasCustomStartDatePassed(startAt, today)` (`lib/utils.ts`) is a pure
  predicate; it's applied at **read time only** (`WeeklyPlannerView.tsx`'s
  `resolveStartAt`, used by `weekTaskLayouts` and the `EditTaskModal`
  `startDate` prop) — deliberately never persisted/cleared via a periodic
  PATCH. An earlier draft did clear it via a `setInterval` + `persistCustomization`
  call; an advisor review caught that this repeats the exact "stale
  full-row PATCH from an in-memory snapshot" bug class already fixed twice
  elsewhere (gamification PATCH races, this section's whole-row-replace
  warning above) — an idle second tab's timer would silently clobber
  whatever a different tab just changed on the same row. The DB value is
  left untouched (a harmless historical fact); a `todayKey` state +
  60s-interval effect just forces a re-render on an actual day rollover so
  an open tab reflects it live, with no network call. If the user later
  edits and saves that task through the modal, `handleSaveTask`'s existing
  diffing (comparing the modal's resolved `""` against the raw stored
  value) incidentally persists the clear too — a bonus, not depended on.
- All planner state is DB-backed per `(userId, taskId)` via
  `TaskCustomization`/`CustomTask`/`TaskPlanningEstimate`/
  `ProcrastinationRecord` — not one per-user JSON blob — so two
  browsers/tabs editing different tasks concurrently can't clobber each
  other. `persistCustomization`'s PATCH is a full-row replace, not a
  server merge — every caller must spread the current known customization
  before overriding its own field(s), or an unrelated save silently
  un-completes/un-deletes/un-overrides a task.
- Any task field is user-overridable via nullable `TaskCustomization`
  columns (`nameOverride`/`typeOverride`/`dueAtOverride`, alongside the
  older `course` override) — only for Canvas-synced tasks; custom tasks
  store everything directly.
- `completedAt` must always be serialized as plain `"YYYY-MM-DD"`
  (matching `startAt`) — anywhere it's a full ISO instant it breaks
  `calculateGridSpan`'s `parseLocalDate` (a past bug produced `NaN` grid
  columns from exactly this mismatch).
- Task status is 3-way (not_started/in_progress/completed), derived (not
  a persisted enum) from two existing fields via `lib/taskStatus.ts`'s
  `getTaskStatus` — chosen to avoid rewriting every existing boolean
  `completed` comparator across the app.
- `pomodoro_state`/`pomodoro_active_task_id`/`planner_theme`/
  `music-player-volume`/`os_window_manager` stay localStorage-only on
  purpose — genuinely per-device, not account data.

**Card labels / courses**
- Card titles: `COURSE - TYPE - DAY - NAME` via `lib/taskLabel.ts`'s
  `formatTaskLabel`; `courseAbbreviation`/`typeCode`/`dayCode` are pure
  functions computed live, never persisted. Course segment always shows
  the abbreviation unconditionally (a width-adaptive version was
  reverted — users read it as an inconsistency bug, not a feature). Type
  code is a fixed 4-value set (`HW`/`R`/`EXAM`/`TODO`) via
  `classifyLabelType` — deliberately separate from the 14-value
  `AssignmentType` in `lib/analyzeAssignment.ts`, which still drives
  scoring/estimates/the procrastination index; don't conflate the two.
  `TODO` is reserved for a task under a user-added custom course
  (`Course.isCustom`; `CUSTOM_COURSE_ORIGIN` in `lib/canvas.ts` is the
  single sentinel source of truth).
- Course abbreviation/color are user-editable `CanvasCourse` columns
  (sync never touches them), edited in `CoursesPanel.tsx` (renamed from
  `ManageCoursesModal.tsx`); unset falls back to deterministic name-hash
  defaults (`courseAbbreviationDefault`, `courseColorDefault` in
  `lib/courseColor.ts`).
- An AI-generated `shortTitle` label segment existed and was iterated on
  across several sessions, then fully removed 2026-09-09 — nothing of it
  remains.
- Known, unfixed: a **hidden** Canvas course is as vulnerable as a
  deleted one to disappearing — sync pruning deletes any `CanvasCourse`
  missing from the latest payload regardless of its `hidden` flag.

**Canvas / extension**
- Canvas integration goes through `canvas-extension/` (reads session
  cookies in-browser, posts to `app/api/canvas/sync` via a `Bearer` token
  backed by `prisma.extensionSession`) — not a server-to-server API,
  since Canvas doesn't give students a way to mint their own token.
- The extension mirrors whichever theme is active on the web app itself
  (not OS preference).

**Gamification / World layer** (`gamificationSystem.md`)
- OS loads by default, not World — per `projectReview.md`'s warning
  against burying the daily task list. `TownState` is a separate Prisma
  model from `GamificationState` (protects existing XP data from a shared
  blob-replace bug). `lib/townGrowth.ts` is framework-free, mirroring
  `lib/prioritization.ts`'s convention. Currency earned always equals the
  same deterministic amount `/api/task-xp` already computes for XP — one
  reward economy. Streak logic: a late completion never breaks a streak,
  only a fully missed day does (2 grace tokens bridge one missed day).
  Mascot is named Nano; World visuals use only `PixelBlock` (colored div +
  emoji/label) as the placeholder-art primitive, no generated art.
- Every field on `PATCH /api/town-state` is genuinely optional
  (present-key validated, absent-key left alone) — never reintroduce a
  "send the whole row" helper. Hardened after three real bugs where a
  stale full-row PATCH (built from a component's own outdated
  `townState` snapshot) silently overwrote `onboardingCompletedAt` or
  just-awarded currency/growth; every writer stays scoped to only the
  fields it owns (`saveTownGrowth` omits `onboardingCompletedAt`;
  `saveOnboardingCompletion` sends only that field).
- `LaptopFrame` keeps OS content always mounted; the inactive view is
  hidden via `invisible` (visibility:hidden), never unmounted or
  `display:none` — a "View Kingdom" toggle must not kill Pomodoro/Music
  playback or re-run `WeeklyPlannerView`'s mount-effect fetches.
- `PomodoroTimer`/`MusicPlayer` each got exactly one additive publish
  effect (no internal rewrite) exposing live state via
  `PomodoroRemoteContext`/`MusicRemoteContext`, consumed by both the real
  OS window and the World's Hourglass/Bard panels. `MusicRemoteContext`
  deliberately excludes playlist create/import/add-track — those read
  `MusicPlayer`'s own internal form state and aren't cleanly
  remote-controllable without a deeper rewrite.

**OS window system** (`components/os/Window.tsx`, `WindowManagerContext.tsx`)
- Generic, app-agnostic window chrome for pomodoro/music/courses:
  position + size + isOpen + isMinimized + zIndex all live in
  `WindowManagerContext`, persisted to `os_window_manager` (new fields
  fall through safely to defaults for pre-existing saved state via a
  per-app shallow merge). Drag/resize gesture code builds fresh,
  non-memoized closures per-gesture rather than stable `useCallback`s — a
  `useCallback`'d handler referencing itself before its own declaration is
  a real bug class this file hit more than once; keep the pattern for any
  future gesture code here.
- The resize grip's clickable area must NOT be clipped by the outer
  window's rounded corner — `overflow-hidden` lives on an inner wrapper
  (title bar + content only), not the outer bordered/sized container,
  because a border-radius-minus-border-width clip (16px − 3px = 13px
  effective radius) removes most of a flush 16×16 grip's hit area, right
  where a user aims.
- Music window must stay mounted whenever `isOpen`, regardless of
  minimized/view state, so audio keeps playing. Pomodoro's
  `onBeforeClose` force-writes a paused snapshot directly to localStorage
  (bypassing React) since `closeWindow`'s unmount lands in the same
  commit as any setState-based pause, and React drops pending updates for
  a component unmounted in that commit. Courses uses a lightweight
  one-way version-counter context (`CoursesRemoteContext`), not a full
  publish/subscribe engine — no live two-way state, no World-panel
  equivalent.
- `MusicPlayer`'s now-playing/tracks sub-grid needs its own `@container`
  scope (on `<main>`), independent of the outer playlist-sidebar grid's
  container — otherwise both nested breakpoints trip off the same width
  and squeeze together on resize instead of laying out independently.

**Misc**
- Theming: dark ("Enchanted Forest")/light ("Cozy Tavern") via CSS
  variables + a Tailwind-class remap layer in `app/globals.css`, scoped
  to `.theme-surface`/`.planner-shell`; `ThemeScript.tsx` sets
  `data-theme` pre-paint from localStorage.
- No test framework installed — `lib/prioritization.test.ts` is a manual
  `npx tsx` script, not part of any suite.

## Active TODOs

- Expired-custom-start-date auto-revert: the completed-task interaction
  (falls back to `completedAt` instead of today) and the live
  60s-interval day-rollover path are unverified live (code-reading only —
  see 2026-09-13 session log).
- Gamification: currency spend/shop UI, cosmetics, and calendar-based
  milestone gating are deliberately deferred. `announcementFound` mascot
  trigger has never fired against a real batch. Kingdom-stage (Town/City/
  Kingdom) visuals only verified by threshold math, not seen rendered.
  Light-theme rendering of `WorldView`/`TownMap`/`OnboardingOverlay`, and
  `TownMap`'s layout at ~400px width, are unchecked. Laptop frame's
  minimum usable height on a short browser window is unchecked (no floor
  anymore).
- Taskbar: `Log Out` was never clicked live (would end the real session)
  — `signOut()` itself is `UserMenu.tsx`'s already-proven code. Start
  button is decorative-only. Layout at ~400px width unchecked.
- Music loop/shuffle: end-of-track behavior (repeat-one restart,
  repeat-all/shuffle wrap) only verified by reading code — the YouTube
  iframe never got past buffering in browser-automation.
- Not a bug, don't "fix" again: the skyline packer's small unfilled
  Thursday gaps in one real week's data are expected (greedy first-fit).
- Untested: `opacity-55` completed-card dimming on the light theme (only
  checked dark). One disclosed, low-stakes leftover: a stray
  `ProcrastinationRecord` from live testing was never cleaned up (no
  delete endpoint).
- Browser-local-state migration: not yet click-tested — a new custom task
  syncing to a genuinely separate second browser; a custom task's PATCH
  edit round-trip; a Canvas re-sync not resurrecting a deleted task;
  whether the estimate-migration filter drops any *valid* entries beyond
  the malformed ones inspected.
- Task-field overrides: only `typeOverride` was clicked through
  end-to-end; `nameOverride`/`dueAtOverride` verified only via
  tsc/lint/build.
- Announcement pipeline reliability/cost changes (RULES dedup,
  concurrency cap, bisection retry, longer timeout, per-entry
  degradation, number-based matching, false-positive bias) haven't been
  re-exercised together against a live run since landing.
- Announcement time-range preset UI (preset switching, custom date
  pickers, the >15 soft-warning) hasn't been separately click-tested.
- Restore-a-deleted-Canvas-course flow is only verified via syntax/tsc/
  lint/build, not a real extension reload/click-through.
- Announcement-analysis polish (HTML-safe rendering, evidence
  highlighting, due-date resolution, persisted accept/reject, "check
  unavailable" status) hasn't been tested against a live Ollama/logged-in
  session.
- Loading-indicator sweep (XP award, course create/save, `MusicPlayer`'s
  `busyItemId`) verified only via tsc/build, never clicked through.
- Canvas sync reconciliation still only prunes whole courses, not
  individual assignments/announcements within an active course.
- A task manually overridden to a non-Canvas course name goes stale again
  if that target course is later renamed (override stores a name, not a
  course id).
- AI-suggested-task course-matching hasn't been clicked through live.
- Music window's track list has a fixed `max-h-[280px]` — doesn't grow/
  shrink with the window's own resize. Low-priority polish.

## Session log

### 2026-09-13 — auto-revert an expired custom start date

User asked for a custom start date to turn back into "auto" once it's
passed, including live while the tab stays open. Initial design (a
periodic PATCH clearing the field) was caught by an advisor review as a
repeat of the whole-row-replace stale-PATCH race already documented twice
in Architecture Decisions — redesigned to a pure read-time derivation
instead (full rationale in the new "Task customization / persistence"
entry above). No schema/API changes.

Verified: tsc clean, lint unchanged (19-problem baseline, confirmed via
`git stash -u` diff), build clean. Live-verified in Chrome against the
real account: backdated a real task's custom start date via
`EditTaskModal`, saved, confirmed the DB value survives untouched but the
modal now displays "Auto" and the grid bar no longer starts from the
stale date; confirmed via the Network tab that reopening/viewing the
modal fires no PATCH (purely derived); cleaned up by resetting that task
back to Auto afterward. **Not separately live-tested**: the completed-task
interaction (an expired start on a completed task falls back to
`completedAt` instead of today) and the live 60s-interval day-rollover
path itself (not practical to wait for a real midnight) — both verified
by code reading only.

### 2026-09-11/12 (iteration 6) — fix resize (real clipping bug), reorder Music player layout

User reported resizing "stuck at the size," and wanted Music's video/
controls prominent instead of buried under playlist buttons.

- Resize grip clipping bug (see Architecture Decisions, OS window
  system) — confirmed live: dragging from the exact boundary pixel of
  the grip's `getBoundingClientRect()` failed repeatedly, a few pixels
  inside worked. Fixed by moving `overflow-hidden` to an inner wrapper.
  Also added `event.preventDefault()` and a `pointercancel` listener to
  both drag and resize gestures, closing a related latent gap (a
  canceled native drag could leave `window` listeners dangling).
- `MusicPlayer.tsx` reordered: Import Playlist/New Playlist/Add Track
  moved out of the top header into the Playlists sidebar; the two-column
  grid swapped so the player (`<main>`) renders first/wider and Playlists
  (`<aside>`) second. Caught and fixed a regression from removing the
  header buttons: the zero-playlists empty state had no way left to
  create a first playlist — added Import/New buttons there too.
- Verified: tsc/lint (19-problem baseline, unchanged)/build clean.
  Live-verified in Chrome: reproduced the exact reported failure (click
  at the grip's literal boundary pixel), confirmed the fix resolves it
  for both Music and Pomodoro in both directions; confirmed the
  reordered layout and persisted sizes.

### 2026-09-11 (iteration 5) — resizable OS windows, wider Music layout, Courses as a real window

User asked for wider/shorter Music (tracks beside the player), all OS
windows resizable, and Courses converted from a modal into a real window.

- Found and fixed a container-query scoping bug before it could bite
  (see Architecture Decisions) — `<main>` needed its own `@container` or
  widening the window alone would trip both nested breakpoints at once
  and squeeze the layout instead of the intended side-by-side result.
- `WindowManagerContext.tsx` gained a per-window `size`, `DEFAULT_SIZES`,
  and `resizeWindow` (see Architecture Decisions for the shared design);
  `Window.tsx` got a resize grip using the same gesture pattern as drag.
- Courses converted from `ManageCoursesModal.tsx` (deleted) to
  `CoursesPanel.tsx` + `CoursesWindow.tsx` + a new lightweight
  `CoursesRemoteContext.tsx`, following the Pomodoro/Music pattern
  exactly (see Architecture Decisions).
- Verified: tsc/build clean; lint 19 vs. an 18-problem true baseline
  (confirmed via `git stash -u`, since a plain stash leaves new
  untracked files in place and misleads the count) — the one new hit is
  the same already-tolerated `void refetchCourses()`-in-effect pattern
  used elsewhere in the same file. Live-verified in Chrome: wide-by-
  default layout with side-by-side tracks, resize/minimize/restore/close
  for all three windows, full persistence across reload.

### 2026-09-11 (iteration 4) — Pomodoro/Music as real draggable OS windows + World equivalents

User wanted Pomodoro/Music to become real draggable/minimizable/closable
OS windows (closed by default, taskbar-launched) with themed World
equivalents (the Hourglass, the Bard) sharing the same live state.

- New `WindowManagerContext.tsx`/`Window.tsx` (see Architecture
  Decisions) plus `PomodoroRemoteContext.tsx`/`MusicRemoteContext.tsx` —
  `PomodoroTimer.tsx`/`MusicPlayer.tsx` needed only one additive publish
  effect each; no internal rewrite (their existing timestamp-based/
  YT-destroy-based persistence already survived unmount/remount).
- Two real bugs caught before/during live testing: closing Pomodoro left
  its countdown silently ticking in localStorage (fixed via
  `onBeforeClose` writing the paused state directly, bypassing React's
  same-commit unmount); toggling to World unmounted the entire OS
  including Music/Pomodoro (fixed by keeping OS content always-mounted,
  hidden via `invisible` not unmount/`display:none`) — see Architecture
  Decisions for both.
- New `HourglassPanel.tsx`/`BardPanel.tsx` as pure presentational
  consumers of the same two contexts; `TownMap.tsx` gained sprites for
  both that call `openWindow()`.
- Verified: tsc clean, lint 18 (same hydration-effect category as
  elsewhere), build clean. Live-verified end-to-end in Chrome: minimize
  keeps Pomodoro counting/Music's iframe playing (same DOM node), World
  panels mirror and can control the same live state, closing Music
  genuinely tears down the iframe.

### 2026-09-11 (iteration 3) — OS taskbar, absorbed header, ambient scanline texture

Added a Windows-style sticky taskbar (Start branding, Add Task/Courses/
Focus/Radio quick-launch, a system tray with Level/XP/currency/streak/
clock, a Settings popover for theme + reused `UserMenu` log-out)
absorbing the old header toolbar and standalone XP card. Moved
`<AIReviewPanel/>` to render from inside `WeeklyPlannerView.tsx`
(previously a sibling in `app/page.tsx`) so the sticky taskbar's
containing block spans the whole OS experience. Deleted
`components/SignInButton.tsx` as confirmed-dead code. Added a faint
ambient scanline overlay, OS-only.

Verified: tsc clean, lint 17 (one new hydration-effect hit, same
category as 3 existing), build clean. Live-verified in Chrome: taskbar
stays pinned through the full scroll height including `AIReviewPanel`,
quick-launch icons work, theme toggle switches live, clock ticks. `Log
Out` itself wasn't clicked (would end the real session).

### 2026-09-11 (iteration 2) — full-page laptop, spatial town map, lid animation, dev/test page

Follow-up to the same-day gamification build, after live use surfaced 4
issues: the laptop frame was a squished vertical strip (fixed by making
it fill the page, each view an independently-scrolling absolute panel
instead of letting content stretch the frame); the World view read as a
stat-card list rather than a place (rebuilt as `TownMap.tsx`, a spatial
scene with percentage-positioned buildings, no literal connector lines
since percentage-based line geometry isn't isotropic across arbitrary
aspect ratios); view transitions had no real animation (added a 3-phase
lid-close/swap/lid-open state machine, `perspective` set only
transiently to avoid breaking `position:fixed` modals); and there was no
way to test gamification states without grinding (added an unlinked
`/dev/gamification` panel with reset controls, a fake-task generator,
and a live non-persisted preview sandbox).

One real bug from the dev panel's own use: its fake-task-id list was
in-memory only, so a reload made "Delete" silently orphan real created
tasks — fixed by persisting the id list to localStorage with the same
load-effect/loaded-flag hydration pattern used elsewhere.

Verified: tsc clean, lint 16 (one new hydration-effect hit, same
category), build clean. Live-verified in Chrome: frame fills the page
with scrolling OS content, town map renders distinct building stages,
lid animation round-trips with no leftover transform affecting modals,
the dev panel's generate→reload→delete loop exercised twice (once
catching the bug, once confirming the fix).

### 2026-09-11 — build the medieval-kingdom gamification layer (gamificationSystem.md)

Built `gamificationSystem.md`'s spec end-to-end: a pixel-art World
(mascot "Nano" + a growing town) wrapped around the existing OS, which
stays the default view. New `TownState` Prisma model (deliberately
separate from `GamificationState` — see Architecture Decisions),
`lib/townGrowth.ts`/`lib/mascotDialogue.ts`/`lib/townState.ts`, and
`components/world/*` (`PixelBlock`, `Building`, `Mascot`, `WorldView`,
`MascotBubble`, `OnboardingOverlay`, `LaptopFrame`). Three additive hooks
into existing code: XP award also awards town growth/streak,
`taskStart`/`announcementFound` mascot triggers. `PomodoroTimer.tsx`/
`MusicPlayer.tsx` got copy-only reskins.

Three real bugs caught by advisor review after initial live testing
looked clean — all were races around `onboardingCompletedAt`/town-growth
getting silently overwritten by a stale full-row PATCH (full account and
the resulting "every PATCH field must be genuinely optional" rule in
Architecture Decisions). All three fixed and re-verified live with the
exact race reproduced each time, then reverted via the same PATCH APIs.

Verified: tsc clean, lint at the pre-existing 15-problem baseline, build
clean. Live-verified end-to-end in Chrome against the real account,
including a full first-run onboarding flow and a real task completion
awarding XP/currency/growth/streak/mascot dialogue correctly, then
reverted.

**Not yet verified live**: `announcementFound` trigger, building stages
beyond the first, Town→City→Kingdom transitions, World/OnboardingOverlay
light theme, HUD mobile layout.

### (date not recorded in the original file — falls between the entries above and below) — Music loop/shuffle and transport redesign

Added loop (`off`/`all`/`one`) and shuffle to `MusicPlayer.tsx`,
persisted to their own localStorage keys, plus a redesigned circular
icon transport row (inline SVGs, theme tokens instead of hardcoded
gray/white). Shuffle uses a Fisher-Yates order anchored on the current
track; a stale-closure fix via refs was needed since the YT player's
event handlers are keyed only to track changes, not to loop/shuffle
toggles.

Real bug caught live: the initial persist effect fired on mount before
the load effect's `setState` committed, silently overwriting a saved
`"one"`/`true` back to defaults on every reload — fixed with the same
`preferencesLoaded`-flag pattern used elsewhere for localStorage
hydration.

Verified: tsc/lint (15-problem baseline)/build clean. Live-verified:
toggle/persist/reload round-trip and both themes. **Not verified live**:
actual end-of-track wrap/restart behavior — the YouTube iframe never got
past buffering in the browser-automation environment.

### 2026-09-09 — fix weekly-grid stacking bugs, redesign completion animation and card sizing

Continuation of the "In Progress" status work, untested until now
against a real multi-day-bar-heavy week. User reported a multi-day bar
breaking the stack and a jumpy completion animation; root cause (no
explicit `gridRow`, CSS Grid auto-placement sharing one cursor for the
week) traced via two Explore agents + an advisor pass. Full design in
Architecture Decisions ("Weekly grid layout"). Iterated live: fixed the
packing first, then per user feedback dropped the slide-to-bottom
animation entirely and switched bar ordering, then shrank/dimmed
completed cards on further feedback. Hit a peer-session file-editing
collision twice on `AssignmentCard.tsx` (paused until idle both times).

Verified: tsc/lint/build clean; live-verified via Chrome against real
data, including disposable test tasks confirmed XP-neutral via `GET
/api/gamification`.

### 2026-09-09 — fix bar ordering and rearchitect away the row-height gaps

Same-day continuation: bars sorted by length looked chronologically
wrong once bars had varied start dates, and completed cards left
inconsistent gaps. An advisor pass on the draft plan caught a
divider-alignment math bug and an unverified card-height assumption
before implementing (full account in Architecture Decisions). Verified
live by pulling every card's `getBoundingClientRect()` and asserting
zero overlaps, sub-pixel divider alignment, and exact 40px completed-card
spacing.

Verified: tsc/lint/build clean; one disposable test-task completion, XP
reverted.

### 2026-09-09 — replace the monotonic-cursor packer with real skyline packing

Same-day continuation: Thursday's column sat nearly empty despite bars
stacking far down the page. Root cause: the packer's per-column cursor
inherited an unrelated column's congestion instead of tracking real
gaps. A first fix (collapsing completed bars to single-day width) worked
but was rejected on sight — a completed bar's original span is real
information. Real fix: a true skyline packer plus a status-group-scoped
ordering rule, decided via `AskUserQuestion` after an advisor pass
flagged the ordering tradeoff as the user's call (algorithm in
Architecture Decisions). Hand-traced predicted numbers before
implementing and confirmed the live DOM matched exactly.

Verified: tsc/lint/build clean; pure layout change.

### 2026-09-09 — user-customizable course badge color

Added `CanvasCourse.color`, following the same "user override, sync
never touches it" pattern as `abbreviation`. Extracted the default-color
hash into `lib/courseColor.ts` so the courses panel could reuse it for
its swatch preview.

Verified: tsc/lint/build clean; live-verified — set a course color,
confirmed it persisted across reload and rendered on real cards, then
confirmed Reset reverted to the auto-derived default.

### 2026-09-08 — add an "In Progress" task status

User wanted to mark a task started/paused without counting it done.
Planned with two Explore agents + an advisor pass, which settled the
schema (one boolean, no timestamp) and caught a 4th completion-toggle
call site that's easy to miss. Followed by UI iterations: a circular
tri-state control and a completion animation (full design in
Architecture Decisions). Hit a concurrent-editing collision with a peer
session mid-session (paused until idle).

Verified: tsc/lint/build/migrate clean; live-verified via Chrome,
including a full status-cycle click-through and reload-persistence
check. Live testing awarded real XP/a procrastination record on 3 real
tasks — XP was precisely reverted, one stray procrastination record was
not (no delete endpoint, low stakes).

### 2026-09-07 — fix grid-wide card misalignment (regression from the DB-migration session, same day)

User reported cards misaligned from day dividers, correctly attributing
it to that day's earlier DB-migration session. Root cause: a
`completedAt` date-serialization mismatch between two API routes
producing `NaN` grid columns (full account in Architecture Decisions).

Verified: tsc/lint/build clean; live-verified against the same real data
used to diagnose the bug.

### 2026-09-07 — migrate remaining browser-local planner state to the database

User reported the planner open in two Chrome profiles wasn't sharing
custom tasks or course abbreviations. Root cause and full design in
Architecture Decisions. A research subagent audited every `localStorage`
key first; an advisor pass corrected the initial design (relational
per-task state, not a blob, given this user's literal two-windows-open
setup) and caught a missing merge-safety rule.

Verified: tsc/lint/build/migrate clean; live-verified against real (not
synthetic) data, which surfaced two real bugs — stale-shaped cached
estimates and an effect-ordering lint error. Deleted
`lib/taskState.ts`/`types/taskState.ts` as confirmed-dead code.

### 2026-09-07 — fix weekly grid stacking order, let users override any task field

Two user-reported issues: grid stacking ignored time-of-day, and
AI-guessed fields other than course couldn't be corrected. Full
rationale in Architecture Decisions. Two Explore agents mapped the
existing sort/override logic first; an advisor pass caught a DST-unsafe
design idea and a missing `name`/`due` persistence gap before
implementing.

Verified: tsc/lint/build/migrate clean; live-verified. `nameOverride`/
`dueAtOverride` and a real Canvas re-sync are not yet live-verified (see
Active TODOs).

### 2026-09-06 — fix the announcement window's week-start mismatch

Continuation of the time-range work below: user still saw 13
announcements when expecting ~6. Code-reading ruled out two suspected
causes twice, wrongly. User pushed back and offered live Chrome-
extension access, which is what actually found it: the planner's
displayed "This week" didn't match the dry-run API's actual date range,
a full week off (root cause and fix in Architecture Decisions). First
session with live browser verification available — directly responsible
for catching what code-reading alone had missed twice.

Verified live: re-ran the dry-run fetch post-fix, `announcementCount` 13
→ 6, exactly one per course for all 6 active courses. Also tsc/lint/build
clean, plus a script covering three different "today" values.

### 2026-09-06 — announcement analysis time-range control

Same session, right after live-testing the Haiku migration: user had to
abort a run because too many announcements were being analyzed at once.
The existing default window was already correct — the real gaps were no
preview before an expensive run and no way to adjust it (full design in
Architecture Decisions).

Verified: tsc/lint/build clean, a logged-out smoke test, and a script
duplicating the route's date-math. No login/browser session to click
through the new UI live this session.

### 2026-09-06 — fix announcement AI reliability, move extraction to Claude Haiku

User reported the Ollama extraction call still frequently failed, and
repeated wanting the duplicate checker biased toward false positives
(already tuned in the prompt, but violated in code). User added
`ANTHROPIC_API_KEY`; decided via `AskUserQuestion` to move only
extraction to Haiku, keeping the duplicate checker on local Ollama (full
rationale in Architecture Decisions).

Verified via a throwaway test harness: 4/4 deterministic bug-fix tests
passed; a live Ollama duplicate-check call correctly flagged real
duplicates and cleared an unrelated task. The first live Haiku attempt
silently fell back to Ollama (a bare script doesn't auto-load `.env`)
but still produced correct output; once loaded, real Haiku calls failed
on an invalid credential — the failure path (typed errors, bisection
retry, per-item degrade) worked as designed. **Resolved same session**
after the user regenerated the key: 3/3 Haiku extractions succeeded with
correct output, including correctly splitting multi-part assignments.

### 2026-09-06 — restore a deleted Canvas course

Added a way to bring back a Canvas course after a real (hard) delete —
previously only a full sync could restore one, and only if Canvas still
reported it active. Since Canvas access only works from the extension,
the restore trigger lives in the extension popup. Extracted course/
assignment/discussion/announcement upsert into new `lib/canvasIngest.ts`
(pure refactor); new `POST /api/canvas/restore-course` reuses it without
pruning; `canvas-extension/background.js`/`popup.html`/`popup.js` gained
a "Find Canvas Courses" → select → "Restore Course" flow.

Verified: tsc/lint/build clean, `node --check` on the extension JS. No
login/live Canvas/extension-reload available this session. Also
surfaced, not fixed: sync pruning also deletes a **hidden** course once
it drops off Canvas's active list.

### 2026-09-06 — card course segment consistency fix

User reported cards sometimes showing the full course name instead of
the abbreviation. Root cause: the course/due-date segments were already
fully deterministic — the actual cause was a width-adaptive
container-query toggle in `AssignmentCard.tsx` (an earlier session's
unverified breakpoint guess) showing the full name on wider cards.
Removed the toggle entirely (see Architecture Decisions). Also flagged:
multiple sessions editing this same working tree concurrently is a real
recurring hazard (see later entries).

### 2026-09-06 — fix AI-suggested tasks not matching their real course

Same session as the fix above. Root cause: the announcement route built
`Announcement.course` from the raw Canvas name instead of the
override-aware `displayName ?? name` resolution used everywhere else, so
a renamed course produced two different strings for the same course,
breaking every downstream string-match (see Architecture Decisions).
Confirmed `suggestionKey` hashes only announcement id + name, so this
didn't invalidate any existing accept/reject decisions.

Verified: tsc/lint clean. Not verified live — see Active TODOs.

### 2026-09-07 — announcement analysis pipeline polish pass

Full pass over the announcement→suggestion→duplicate-check→review flow
per direct user feedback ("pretty trash," raw HTML shown, stale
re-suggestions). Full rationale in Architecture Decisions. Fixed:
raw-HTML display + evidence highlighting, Ollama call consistency
(`temperature: 0`, timeouts, per-task validation), a deterministic
`dueText`→date parser (`lib/dueText.ts`), persisted accept/reject state,
and a distinct "duplicate check unavailable" status separate from a
genuine no-match. Deleted dead-code `lib/ai/selectRelevantAnnouncements.ts`.

Verified: tsc/lint/build/migrate clean, plus a standalone spot-check of
`lib/dueText.ts`. No Ollama/logged-in session available — see Active
TODOs.

### 2026-09-06 — remove redundant AnalyzeAnnouncementsButton

`app/page.tsx` rendered two separate triggers for the same analyze-
announcements call — one just `console.log`ged the result, the other
(`AIReviewPanel.tsx`) was the real accept/reject/edit flow. Deleted the
dead one; `AIReviewPanel` is now the only entry point.

### 2026-09-06 — fix broken announcement analysis, bias duplicate detection, loading indicators

User tried announcement analysis for real and got zero results — every
batch timed out or came back malformed. Root cause: raw, unbounded
Canvas HTML passed straight into the Ollama prompt with no cap, blowing
past a context window that was never set explicitly anywhere. Fixed:
new `lib/htmlText.ts`; per-entry batch degradation; `OLLAMA_NUM_CTX =
8192` set on all call sites; duplicate detection rewritten to skew hard
toward false positives; loading indicators (`Spinner.tsx`) added across
every identified gap.

Verified: tsc/lint/build clean, plus a synthetic script confirming HTML
truncation worked. Could not reproduce the original failure end-to-end
(no login/real Canvas data) — see Active TODOs.

### 2026-09-06 — pre-gamification cleanup pass

Readiness audit (3 parallel code-quality passes) before starting
`gamificationSystem.md`. Fixed: `findDuplicateTask.ts`'s real cause of
occasional missed duplicates (one malformed entry blanking the whole
announcement's results); consolidated 5 inconsistent Ollama configs into
`lib/ollamaConfig.ts`; moved gamification state to a DB-backed model
(see Architecture Decisions); fixed Canvas pagination (was silently
losing everything past page 1 for any course with 100+ items). Deferred
as known/lower-severity: `WeeklyPlannerView.tsx`'s size, the intentional
`getTaskPriority`/`calculatePriority` divergence, no automated tests.

Verified: tsc/lint/build clean, a logged-out smoke test.

### 2026-09-06 — task name normalization (compact card labels)

Added the `COURSE - TYPE - DAY - ...` compact card label replacing the
raw assignment name, plus `CanvasCourse.abbreviation` and
`classifyAssignmentType` extraction — the parts still current are in
Architecture Decisions. This session also introduced the AI-generated
`shortTitle` segment that several later sessions iterated on and then
fully removed 2026-09-09 — none of that code exists anymore.

### 2026-09-05/06 — theming pass, extension theme sync, card compaction, due-time editing

Large multi-round session: an app-wide bug/theming-normalization pass,
then several rounds of user feedback tightening the assignment cards and
Pomodoro/Music Player layout. Real bugs fixed: a theme-flash race in
`WeeklyPlannerView.tsx` (three competing sources of truth for
`data-theme`), DST-unsafe day-diff math (new shared `daysBetween()`), a
mismatched frog-score threshold, an unused `estimatedMinutes` priority
input (now a tie-breaker), a manifest typo, and `analyzeAssignment.ts`
not following the repo's Ollama-fallback convention. `MusicPlayer.tsx`
switched to Tailwind v4 container queries. Assignment cards went through
several compaction rounds (dropped due-date text/late badge/priority
badge; hover-only focus/delete buttons). Added the due-*time* picker
(`DueTimeField.tsx` — see Architecture Decisions).

### Earlier sessions (2026-09-04 – 2026-09-06), condensed

- Workspace scaffolding: `CLAUDE.md` conventions/commands, `.claude/skills/`.
- Prioritization module built end-to-end per `prioritizationModule.md`
  (procrastination index, Up Next card, `assignmentType` threading).
- Priority-scoring bug fixed (urgency must dominate — see Architecture
  Decisions); stale/cross-user Canvas data bugs fixed in `lib/canvas.ts`;
  manual course hide/delete added; Ollama GPU load reduced (batching +
  the estimation-scope cap now in `prioritizationModule.md`); Pomodoro
  focus-task flow added.
- Persistent per-task customization added (`TaskCustomization`): start
  date, then course override + notes, then a course dropdown/rename/
  custom-course management UI. Fixed a bug where a renamed course
  wouldn't show on existing cards (see the residual limitation in Active
  TODOs).
- Quick-add: a "+" on any calendar day pre-fills that day's due date in
  `AddTaskModal`.
