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
- A task with a future custom start date (`TaskCustomization.startAt` >
  today) can never be auto-selected as Up Next/the frog — the user
  literally can't start it yet. Implemented as a **gate on the final
  score** (forced to `0`), not a new weighted term, per
  `prioritizationModule.md`'s "Start-date gate" section (added alongside
  "Scoring formula" — read both before touching `lib/prioritization.ts`).
  `PriorityInput` gained optional `startAt`/`today` fields (both plain
  `"YYYY-MM-DD"`, `today` passed in explicitly rather than read via `new
  Date()`, matching `lib/utils.ts`'s `hasCustomStartDatePassed` convention
  so every call site in the same render agrees on "now"); both are
  optional so `app/api/task-planning/route.ts`'s call (no
  `TaskCustomization` access at that layer) is untouched and fully
  backward compatible. An already-overdue due date always wins over a
  stale future `startAt` (e.g. Canvas moves `due_at` earlier after
  `startAt` was set) — never hide something now overdue.
  `WeeklyPlannerView.tsx`'s `upNext` loop hard-excludes
  `priority.notYetStartable` candidates (not just score-suppresses them),
  and its `useMemo` deps gained `todayKey`/`taskCustomizations` now that
  `computeTaskPriority` reads them directly. `activeFocusTask` (explicit
  "Focus in Pomodoro"/per-task focus toggle) is deliberately left
  ungated — that's a direct user choice, not auto-prioritization.

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
- `dueAtOverride` is a single nullable `DateTime` instant — there's no way
  to represent "override just the date, defer time-of-day to auto/end-of-
  day" as a distinct case from "override to this exact instant." A real
  bug shipped from this gap: `resolveDueTime` (`lib/utils.ts`) returns
  `dueAt: null` whenever `EditTaskModal`'s due-time field is in "End of
  day"/auto mode, discarding whatever new due *date* was picked in the
  same save; `WeeklyPlannerView.tsx`'s `handleSaveTask` then diffed only
  the raw `dueAt` instant to decide whether to persist an override, so a
  date change made in auto mode collapsed to `""` (this codebase's
  "unset" sentinel) and was silently dropped — masked in the same session
  by the optimistic `setTasks(...)` at the top of `handleSaveTask`, only
  reappearing as "the edit reverted" on the next reload. Fixed by diffing
  the *effective date* instead of the raw instant when `updatedTask.dueAt`
  is null, and synthesizing a concrete end-of-day instant (new
  `endOfDayInstant()` in `lib/utils.ts`, same client-side
  `parseLocalDate`+`setHours` pattern `resolveDueTime` already uses) so
  the new date actually persists as `dueAtOverride`. Deliberately did not
  touch `resolveDueTime` itself (shared with `AddTaskModal.tsx`, where
  `dueAt: null` is correct) or add a schema migration for a separate
  date-only column (unwarranted once the diff is fixed). Known, accepted
  cosmetic side effect: reopening the modal for a date-only-overridden
  task now shows "Custom time 11:59 PM" instead of "End of day" (`
  formatTimeInputValue` can't tell a synthesized instant from a genuine
  one) — already true today for most real Canvas tasks anyway, whose
  `due_at` is itself ~23:59.
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
  reward economy. Mascot is named Nano.
- **Streak mechanic removed entirely 2026-09-15** (`currentStreak`/
  `longestStreak`/`graceTokens`/`lastGoodDay`, `updateStreak`/
  `applyDailyCompletion`) per explicit user instruction — "goes against
  the principles of the game." Not replaced with a softer version; any
  future day-to-day consistency requirement should be re-litigated with
  the user before adding one back. Watchtower now grows from a flat
  `applyWatchtowerBonus` (+5) on any on-time completion, no
  consecutive-day tracking. `TownState.kingdomStage` (persisted
  `village`/`town`/`city`/`kingdom`) replaced the 4 removed columns —
  migration `20260915173636_remove_streak_add_kingdom_stage`.
- **Real sprite art now wired into `Building.tsx`** (2026-09-15) —
  `PixelBlock` placeholder is gone from building rendering (still used
  elsewhere for decorations). `BUILDING_STAGE_SPRITES`
  (`lib/spriteMap.ts`) maps each `BuildingKey` to a real 3-sprite ladder
  (`grass` → founded → upgraded); all 5 ladders use genuine distinct
  sprites from Toen's pack, no decoration-compositing needed for this
  MVP. `computeBuildingStage`'s existing `[0, 60, 200]` 3-stage
  thresholds were kept unchanged — sprite inventory happened to support
  exactly 3 stages per building.
- **Kingdom-wide stage is milestone-gated, not live** — per-building
  growth still updates immediately on every matching completion (and the
  `WorldView` progress bar still climbs live via `totalTownGrowth`), but
  the persisted `TownState.kingdomStage` label/visual only advances at a
  checkpoint: `maybeAdvanceKingdomStage` (`lib/townGrowth.ts`) checks
  every `MILESTONE_CHECK_INTERVAL = 5`th completed task
  (`GamificationState.awardedTaskIds.length` — no separate counter) and
  jumps straight to whatever stage `computeKingdomStage` says is
  currently eligible (never step-advances through intermediate stages,
  never regresses). Live-verified: a checkpoint at the 80th completion
  correctly jumped `village` → `kingdom` directly in one shot, matching
  design.
- Every field on `PATCH /api/town-state` is genuinely optional
  (present-key validated, absent-key left alone) — never reintroduce a
  "send the whole row" helper. Hardened after three real bugs where a
  stale full-row PATCH (built from a component's own outdated
  `townState` snapshot) silently overwrote `onboardingCompletedAt` or
  just-awarded currency/growth; every writer stays scoped to only the
  fields it owns (`saveTownGrowth` omits `onboardingCompletedAt`;
  `saveOnboardingCompletion` sends only that field).
- **New bug class found 2026-09-15, don't reintroduce**: a `useState`
  functional updater passed to `setGamification`/`setTownState` in
  `WeeklyPlannerView.tsx`'s `awardXpForTask` is **not invoked
  synchronously at the call site** in this app (confirmed live via
  direct instrumentation — a `console.log` placed immediately after the
  `setGamification(fn)` call printed *before* a `console.log` inside
  `fn` itself). Code that gates subsequent synchronous logic (an early
  `return`, or reading a ref the updater was supposed to have set) on a
  variable mutated inside that updater is broken: the gate always sees
  the updater's *pre*-mutation state, since the updater hasn't actually
  run yet. This silently no-op'd every single XP/currency/growth award
  for a full debugging session (`task-xp` fired and returned a real
  reward, but the `gamification`/`town-state` PATCHes that should
  persist it never did — confirmed via a monkey-patched `window.fetch`
  and zero console errors, since a normal early `return` throws
  nothing). Fixed by moving the dedup check and next-state computation
  fully outside any `setState` updater — against `latestGamificationRef`/
  `latestTownStateRef` (kept synchronously up to date by `awardXpForTask`
  itself, seeded from the initial `getGamificationState`/`getTownState`
  load) — then calling `setGamification(nextValue)`/
  `setTownState(nextValue)` with plain values purely to trigger a
  re-render. Live-verified post-fix: exactly one `PATCH
  /api/gamification` + one `PATCH /api/town-state` per completion, exact
  expected deltas.
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
- Real tile art (Toen's Medieval Strategy Sprite Pack, CC-BY 4.0) —
  `lib/spriteSheet.ts` (framework-free rect math, `SpriteCoord` with
  optional `colSpan`/`rowSpan` since many sprites are taller/wider than
  one 16px cell) + `lib/spriteMap.ts` (named coordinates, one file, every
  entry required to be crop-and-visually-confirmed before being added —
  see the file's own header comment) + `components/world/TileSprite.tsx`
  (CSS background-position renderer, `public/tiles/
  toen-medieval-strategy.png`, integer `scale` only — fractional scale
  bleeds neighbor-tile pixels). `Building.tsx` renders real sprite art
  per stage (`BUILDING_STAGE_SPRITES`); `PixelBlock` (colored div +
  emoji) is still used for the Mascot/Hourglass/Bard/laptop buttons and 2
  of the original 3 ground decorations (log, sign) — no sprite
  equivalent identified for those, not a gap to "fix." The raw sheet is
  112x832px/7x52 cells, but **rows 46-52 are a baked-in CC-BY
  badge/attribution-text graphic, not sprites** — confirmed by cropping
  and viewing them; never add a `SPRITE_COORDS` entry there. Attribution
  lives on `/credits` (linked from the Taskbar's ⚙️ popover, not a
  page-body footer, since the Taskbar is `sticky bottom-0` on every
  page). No PIL/ImageMagick is installed on this machine for
  cropping/inspecting the raw sheet — macOS's built-in `sips` exists but
  its `--cropOffset` semantics are unreliable/easy to misread (burned
  real time on this 2026-09-15); a small hand-written PNG decoder
  (`struct`+`zlib`, no external deps) reading raw pixels directly is the
  proven-reliable approach — reuse it, don't re-derive it.
- **`TownMap.tsx`'s ground is two layered sprite passes, not CSS**
  (2026-09-15, second world-polish session) — a fixed `GROUND_COLS ×
  GROUND_ROWS` (60×30) array of absolutely-positioned 48px cells,
  computed once at module scope, alternating `grass`/`grass_dark` for a
  checkerboard "grid" look, with `grass_tufted`/`grass_tufted_alt`
  scattered on a fixed deterministic subset (~9% of cells, no
  `Math.random()` — would reintroduce the SSR hydration-mismatch class
  already documented above under "Task customization / persistence").
  Explicit JS-computed row/col (not CSS Grid `auto-fill`) is required
  for the checkerboard: the browser's real column count depends on
  container width, which isn't knowable at render time, so CSS
  auto-placement can't reliably drive alternating parity. The root
  `TownMap` div **must** keep an opaque `backgroundColor` fallback (not
  just the sprite tiles) — `LaptopFrame` keeps the OS view mounted
  behind it (`visibility:hidden`), and a handful of OS elements
  override back to `visibility:visible` on themselves; without an opaque
  root, any gap in the tiled ground (even a sub-pixel one, hit once this
  session when the ground was a CSS Grid short on explicit cells) lets
  that content show through.
- **The World map is now user-designed data, not hardcoded arrays**
  (2026-09-15, `/dev/map-editor`) — five rounds of "move this sprite a
  little" on hardcoded terrain/path constants proved the real problem:
  this pack's road art is junction-shaped (cross/T pieces built for an
  orthogonal grid), so any *computed* diagonal path looks wrong no matter
  how it's placed — a person has to place it by eye. `WorldLayout`
  (Prisma model, `userId @unique`, one JSON `data` column) holds a
  `WorldLayoutData` (`types/worldLayout.ts`): ground theme (which 2
  sprites alternate for the checkerboard + which 2 scatter as tufts, and
  the density), a freeform `decorations` list (forest/mountain/water/
  farmland/paths/anything — this is where paths live now, hand-placed),
  `buildingStageSprites` (which sprite each building uses per growth
  stage), `scatterHouses` (growth-gated, same reveal mechanic as before),
  and an optional `wall` (kingdomStage-gated). A full JSON blob is the
  right fit here (unlike `TaskCustomization`'s per-row convention, built
  for concurrent-tab safety) — this is one artifact one user designs in
  one sitting, so a full-row replace on save is expected, not a hazard.
  `DEFAULT_WORLD_LAYOUT` (`lib/worldLayout.ts`) is the exact content the
  old hardcoded constants used to have, ported 1:1 — every user who
  hasn't opened the editor yet sees zero visual change.
- **A `TileRef` is either a catalog name or a raw sheet coordinate** —
  `{kind:"named", name}` or `{kind:"raw", coord}` — because the editor's
  picker lets a user click literally any of the sheet's cells, not just
  the ~35 already named in `spriteMap.ts`. `coordToTileRef()`
  (`lib/worldLayout.ts`) stores a raw pick as a catalog name instead when
  it happens to exactly match one (more readable saved JSON). `TileSprite`
  accepts `name` **or** `coord` for this reason; `TileRefSprite` is a
  thin adapter so call sites holding a `TileRef` don't each re-implement
  the branch. `Building.tsx` takes a `stageSprites` prop instead of
  importing a static constant — same reasoning.
- **Ground tuft scatter uses a real integer hash, not a small-modulus
  formula** — an earlier version, `(row*7+col*13)%11`, produced a
  visible diagonal stripe pattern (small integer coefficients reduced mod
  a small number don't mix enough to avoid low-order periodicity; humans
  spot this easily). `TownMap.tsx`'s `hashCell()` (Thomas Wang's 32-bit
  integer hash) fixes this while staying deterministic (no
  `Math.random()` — would reintroduce the SSR hydration-mismatch class
  documented elsewhere in this file) — reuse it for any future "scattered
  but not random-looking" placement need on this map.
- **The map editor's canvas is a real, non-interactive `TownMap` with an
  interactive overlay on top** — `pointer-events-none` on the live
  preview (so editor clicks never fire `TownMap`'s own Hourglass/Bard/
  laptop buttons) plus a sibling absolutely-positioned layer that
  converts click/drag position to a cell on its own
  `getBoundingClientRect()` — the *absolute* cursor position each event,
  not a delta from drag-start (unlike `components/os/Window.tsx`'s
  gesture pattern, which this otherwise follows: fresh non-memoized
  closures per gesture). `TownMap` needs its own `WindowManagerProvider`
  wrapper wherever it's rendered standalone outside `LaptopFrame` (a
  pre-existing gap — `GamificationDevPanel.tsx` hits the same
  "`useWindowManager` must be used within `WindowManagerProvider`" error,
  documented earlier in this file — the editor page adds its own wrapper
  rather than working around it). Browser-automation drag simulation
  (`left_click_drag`) doesn't dispatch real `PointerEvent`s, so it can't
  verify this interaction — dispatching synthetic `PointerEvent`/
  `MouseEvent`s directly via `javascript_tool` is the reliable way to
  test it without a real mouse (a plain `.click()` call combined with
  separately-dispatched `pointerdown`/`pointerup` in the same tick was
  unreliable; one real `MouseEvent('click', ...)` on the actual target
  worked).
- **Placements are stored as grid row/col (`lib/mapGrid.ts`), not a
  percent of the container** (2026-09-15, sixth session) — the original
  design snapped percent positions to a pixel grid (`GROUND_TILE_PX`
  rounding done before converting to a percentage of the canvas's own
  `getBoundingClientRect()`), which the user then reported as "the cities
  are not aligned on the grid, so the paths don't match up." Root cause,
  confirmed via `advisor`: percent-of-container is fundamentally the
  wrong unit here, since the ground itself is a **fixed-pixel** grid
  (`2880x1440px`, clipped by `overflow-hidden`, never scaled to the
  container — a deliberate earlier choice to support "no fixed aspect
  ratio"). A snapped percentage only lands back on a multiple of 48px at
  the exact container width it was computed against; the editor's canvas
  and the real World view are essentially never the same width, so
  percent-stored placements silently drifted off-grid the moment they
  were viewed anywhere but the editor. Fixed by changing
  `types/worldLayout.ts`'s `PlacedTile` (and the new
  `buildingPositions`) to store integer `row`/`col` grid-cell coordinates
  instead of `top`/`left` percentages — rendering is just
  `row * GROUND_TILE_PX`/`col * GROUND_TILE_PX`, identical in the editor
  and the real view at any container width, by construction. Building
  positions (`TownMap.tsx`'s old hardcoded `BUILDING_LAYOUT` top/left
  strings) moved into this same system as
  `WorldLayoutData.buildingPositions: Record<BuildingKey, {row, col}>`,
  with drag/snap support added to the map editor's Buildings tab — this
  was the direct fix for "buildings aren't aligned to the grid the paths
  snap to," since buildings were never part of the editable layout before
  this. `DEFAULT_WORLD_LAYOUT`'s old percent numbers are preserved as
  literal arguments to a one-time `toGrid(percent, cells)` conversion
  helper in `lib/worldLayout.ts` (not hand-recomputed) — this conversion
  is explicitly approximate (percent was never well-defined against the
  fixed grid to begin with) and isn't meant to be exact, since redrawing
  the paths by hand in the editor is still the actual outstanding TODO.
  No saved `WorldLayout` DB row existed yet for the real account at the
  time of this change, so there was no old-shape row to migrate;
  `isValidWorldLayoutData` will reject a hypothetical old percent-shaped
  row (missing `buildingPositions`, `row`/`col`) and fall back to
  `DEFAULT_WORLD_LAYOUT` rather than crash, consistent with its existing
  "loose validation, never trust a malformed save" design.
- **Any conditionally-rendered panel in this editor must never live in
  the same layout flow as a click target** — the "Selected placement"
  edit controls (Scale/Replace/Delete) used to render directly above the
  canvas and only when something was selected; the instant a selection
  happened, that panel's insertion pushed the canvas down, so the next
  click (aimed at the just-appeared Delete button) landed on the
  reflowed canvas instead and got captured as "add a new tile" —
  compounding with the `stopPropagation` bug above to make Delete nearly
  unusable. Fixed by moving that panel into the independently-laid-out
  left sidebar. `pointerdown`/`pointerup` and `click` are also
  independent events from the same physical click — stopping propagation
  on one does not stop the other; a handle that calls
  `stopPropagation()` in its `onPointerDown` still needs the same call in
  its own `onClick`, or a plain select-click still bubbles to the
  canvas's add-new-tile handler. **Superseded, not just patched, in the
  seventh session** (below): the sidebar itself was later replaced by a
  `position: absolute` floating drawer that overlays the canvas rather
  than sitting beside it in flex/grid flow, so this whole bug *class* is
  now structurally impossible in this editor, not just avoided for the
  one panel that originally triggered it.
- **The map editor's canvas is sized to match the real World view, not a
  small fixed box — true WYSIWYG** (2026-09-16, seventh session) — the
  user's very next report after the row/col fix above was "the map in
  the edit view doesn't show the full map that would have been on the
  planner view." Root cause: the real "View Kingdom" screen renders
  `TownMap` inside `app/page.tsx`'s `h-screen w-screen` (essentially the
  full browser viewport), while the editor's canvas was a fixed
  `height: 640` box squeezed into a `max-w-[1400px]` layout next to a
  permanent 300px sidebar — dramatically smaller and differently
  proportioned, so content placed near an edge in one view could be
  genuinely off-screen in the other. This, not bad default coordinates,
  was the real explanation for "only one building shows automatically."
  Fixed by making `/dev/map-editor`'s canvas full-viewport
  (`app/dev/map-editor/page.tsx` now uses `h-screen w-screen
  overflow-hidden`, matching `app/page.tsx`; `MapEditor.tsx` dropped the
  `max-w-[1400px]` two-column grid for a slim fixed-height top bar +
  full-bleed canvas below it) and moving the sprite-picker/tabs/selected-
  item panels into a `position: absolute` floating drawer (toggled via a
  "🎨 Tools" button) that overlays the canvas instead of sharing layout
  flow with it — so the canvas's pixel dimensions, and therefore the
  row/col-to-pixel mapping, never change when the drawer opens or
  closes. `DEFAULT_WORLD_LAYOUT`'s `toGrid()` conversion basis
  (`lib/worldLayout.ts`) also moved off the full `GROUND_COLS`/
  `GROUND_ROWS` (60x30 — the size of the oversized, clipped ground
  backdrop, not what's actually visible) onto new, smaller
  `DEFAULT_VISIBLE_COLS`/`DEFAULT_VISIBLE_ROWS` constants (`lib/mapGrid.ts`,
  26x14 — a "typical full-screen browser window" guess) — still only a
  best-effort starting point, but now the user can immediately *see*
  anything off-screen while editing (since the editor and the real view
  show the same area) and drag it back, which is the actual fix; the
  constant just makes the out-of-the-box default less obviously wrong.
- **Buildings became a freeform-placeable category, not just a fixed
  set of 5** (seventh session) — the user asked to "drag new [buildings]
  into the map," which the 5 growth-mechanic buildings (`townSquare`/
  `library`/`workshop`/`trainingGrounds`/`watchtower`, each tied 1:1 to a
  `TownState` growth field) can't support — they must stay singleton.
  Added `WorldLayoutData.extraBuildings: PlacedTile[]`, architecturally
  identical to `decorations` (own list, same shape), defaulting to `[]`.
  The map editor's existing "Buildings" tab now does double duty:
  clicking empty canvas space there adds a new extra building (reusing
  the exact same generic `addPlacementAt`/`updatePosition`/`startDrag`/
  `deleteSelected`/`rescaleSelected`/`replaceSelectedTile` helpers
  already built for decorations/scatterHouses — `activeList` just maps
  `"buildings"` → `"extraBuildings"`), while the 5 fixed buildings render
  as separate, non-addable/non-deletable drag handles in the same tab.
  `TownMap.tsx` paints `extraBuildings` right after `decorations`.
- **Fixed buildings' map-editor drag handle now reflects their real
  multi-tile footprint** (seventh session) — multi-tile building sprites
  already existed and already *rendered* correctly (`getSpriteRect`
  already accounted for `colSpan`/`rowSpan` — `castle_wall`/
  `town_walled`/`town_fortress`/`town_wood_fenced` all span >1 cell); the
  gap was purely that the editor's drag-handle box for the 5 fixed
  buildings was a hardcoded 3x3-cell guess regardless of the actual
  sprite. `Building.tsx`'s `STAGE_SCALE` is now exported;
  `MapEditor.tsx`'s `buildingHandleSize(key)` takes the max, over all 3
  stage sprites, of `getSpriteRect(...).width/height * STAGE_SCALE[stage]`
  — same sizing technique decoration/scatterHouse/wall handles already
  used, just applied to buildings too. Live-verified: Watchtower's
  handle (stage 2 is `castle_wall`, `colSpan:6`) now renders as a wide
  ~288px box instead of the old fixed ~144px guess.
- **The World view's fixed UI anchors (Mascot, Hourglass/Bard/laptop
  buttons) are now user-repositionable, not hardcoded** (seventh
  session, "make it so I can move the buttons too") — added
  `WorldLayoutData.markers: Record<"mascot"|"hourglass"|"bard"|"laptop",
  {row,col}>` (`types/worldLayout.ts`'s new `MarkerKey`).
  `TownMap.tsx`'s `markerPos(key)` replaces the 4 old hardcoded
  percent-position `style` props. New "Markers" tab in the editor with
  drag handles for all 4, via a new generic `startSingleDrag(onMove,
  selectId, event)` — factored out specifically so buildings and markers
  (both "one fixed named item, drag-only, no add/delete") share one
  gesture implementation instead of two near-identical copies.
- **Multiple sprite packs are now supported via a code registry, not an
  in-app upload flow** (seventh session — confirmed with the user: this
  app has no writable image storage at runtime, `public/` is static, so
  an upload UI would need real new persistence infrastructure that isn't
  justified yet). New `lib/spriteSheets.ts`: `SpriteSheetId`/
  `SpriteSheetDef`/`SPRITE_SHEETS` registry (currently one entry, `toen`,
  a values-preserving move of what was hardcoded in `lib/spriteSheet.ts`
  and `TileSprite.tsx`). `getSpriteRect(coord, sheet)` now takes the
  sheet explicitly (looks up `tileSize` from the registry — a future
  pack need not share the current 16px tile size).
  `SPRITE_COORDS` (`lib/spriteMap.ts`) restructured to `Record<SpriteSheetId,
  Record<string, SpriteCoord>>`; `SpriteName` is now a plain `string`
  (validated at runtime against `SPRITE_COORDS[sheet]`, same pattern the
  raw-coord `TileRef` branch already used) rather than a compile-time
  literal union, since the catalog is now open-ended. `TileRef`
  (`types/worldLayout.ts`) gained a required `sheet: SpriteSheetId` on
  both `named` and `raw` variants — a sprite name is only unique within
  its own sheet. `MapEditor.tsx` gained a sheet-switcher control (hidden
  when only one sheet is registered) driving the picker grid/quick-picks/
  brush. Removed the confirmed-dead `BUILDING_STAGE_SPRITES` constant
  from `lib/spriteMap.ts` while restructuring that file (grepped: zero
  references anywhere — an earlier TODO entry believed this was already
  gone, but it wasn't, until now). Adding a real second pack going
  forward: drop the PNG under `public/tiles/`, add one `SPRITE_SHEETS`
  entry — no other code changes required to start picking raw tiles from
  it.
- **The map is a fixed-size logical frame, scaled-and-panned to fit any
  screen — not an oversized grid clipped by `overflow-hidden`** (eighth
  session, 2026-09-16 — "different size screens will warp the map
  differently... there's a minimum frame that will always be visible no
  matter the size of the screen"). This replaces the seventh session's
  fix (making the editor canvas's literal pixel dimensions match the
  live view's) with something stronger: both views now render the exact
  same fixed `FRAME_COLS x FRAME_ROWS` content (`lib/mapGrid.ts`, still
  26x14 — this *is* now the entire map, not a viewport into a larger
  backdrop, so `GROUND_COLS`/`GROUND_ROWS` were renamed to `FRAME_COLS`/
  `FRAME_ROWS` and no longer oversized) and let a shared
  `components/world/MapViewport.tsx` scale it to fit whatever container
  it's given — content parity no longer depends on the two containers
  having matching pixel dimensions at all, just on both using
  `MapViewport`. `TownMap.tsx` itself stopped being responsive (fixed
  `FRAME_WIDTH_PX x FRAME_HEIGHT_PX` block, no `h-full`/`w-full`/measuring
  of its own) — sizing is entirely `MapViewport`'s job now.
  `WorldView.tsx` and `MapEditor.tsx` both just wrap their map content in
  `<MapViewport>`; `GamificationDevPanel.tsx` needed no changes since it
  already goes through `WorldView`.
- **`MapViewport` also owns real pan/zoom** (wheel-zoom-to-cursor,
  drag-to-pan, and two-pointer pinch-zoom-and-pan — Pointer Events
  already unify mouse/touch/pen, so pinch needs no separate touch
  listeners) — confirmed with the user as the desired interaction model
  ("natural zooming with scroll to zoom and drag to move on pc, but
  pinch to zoom on mobile"), not just a static fit. A `pointerdown` that
  never reaches `MapViewport`'s own handler — because a descendant
  already called `stopPropagation()`, as every placement handle already
  does — simply never starts a pan gesture, so existing handle-drag
  logic in `MapEditor.tsx` needed zero changes to coexist with this. A
  gesture that stays under `DRAG_THRESHOLD_PX` (~6px) never pans and
  never suppresses anything, so a plain tap/click (place a tile; press
  Hourglass/Bard/laptop) works normally; a gesture that crosses the
  threshold pans instead and installs a one-time **capture-phase**
  click-swallower on `MapViewport`'s own root (so it intercepts before
  the event reaches any descendant's `onClick`, canvasRef's included) —
  both live-verified via directly-dispatched `PointerEvent`+`click`
  sequences (a real drag-then-click was correctly suppressed; a real
  tap-then-click was correctly not).
- **Real bug caught during pinch testing, fixed same session**: the
  `handleMove` window listener's "pan" branch computed `dx`/`dy` from
  *whichever* pointer's move event fired, without checking
  `event.pointerId === gesture.pointerId` — harmless for a genuine
  single-finger pan, but if a second pointer went down before the
  pinch-start branch could successfully switch `gestureRef` to `"pinch"`
  (itself possible if `transform` state was still `null`, e.g. right at
  mount), the second pointer's coordinates got misapplied as if they
  were the first pointer's, producing an incorrect pan. Fixed two ways:
  added the missing `pointerId` guard to the pan branch, and hardened
  pinch-start to fall back to `fitTransform` (not just `transform`
  state) so it reliably switches to `"pinch"` even in that race.
- **Lesson for next time something here needs live verification**: in
  this browser-automation environment the tab reports
  `document.visibilityState: "hidden"`, which measurably delays (not
  breaks) `ResizeObserver`/`setState`-driven re-renders — reading the DOM
  back in the *same* or very next tool call after triggering a resize
  read stale values several times in a row, looking exactly like a
  broken feature, until a `console.log` + a separately-timed follow-up
  read proved the state update did land, just later than a normal
  foreground tab would show it. Don't conclude "broken" from an
  immediate post-mutation DOM read in this environment — add a real
  delay (or a debug log plus a separate follow-up read) before trusting
  a negative result, especially for anything gated behind React's own
  re-render scheduling rather than a direct DOM write.
- **Every interactive element that renders inside `MapViewport`'s
  transformed frame must stop its own `pointerdown` from bubbling**
  (2026-09-16, ninth session — "the fit button doesn't work"). Root
  cause: `MapViewport` starts a candidate pan gesture on any
  `pointerdown` that reaches its own root unopposed, and only commits to
  an actual pan once movement crosses `DRAG_THRESHOLD_PX`. Placement
  handles in `MapEditor.tsx` already called `stopPropagation()` on their
  own `pointerdown` (needed for a different reason — see the "duplicate
  on select" bug from the fifth session), so they were never affected,
  but nothing else was: the new "⤢ Fit" button and every real `<button>`
  inside `TownMap.tsx`/`HourglassPanel.tsx`/`BardPanel.tsx` had no such
  guard. A synthetic zero-movement test click never exposes this (which
  is exactly why it shipped looking fine), but a real mouse/trackpad
  click almost always has a few incidental px of movement between
  mousedown and mouseup — enough to cross the threshold, trigger
  `suppressNextClick`'s capture-phase listener on `MapViewport`'s root,
  and eat the button's own click before it ever fires. Fixed by adding
  `onPointerDown={(e) => e.stopPropagation()}` to the Fit button, each of
  TownMap's Hourglass/Bard/laptop buttons individually, and once each on
  `HourglassPanel`/`BardPanel`'s own root wrapper (covers every button
  inside those panels in one line, rather than repeating it per-button).
  **Any future button added inside this tree needs the same guard** —
  there's no automatic protection otherwise. Also bumped
  `DRAG_THRESHOLD_PX` 6→10 as cheap extra insurance for the *background*
  tap-vs-drag case (placing a tile, tapping empty canvas), which has no
  `stopPropagation` fallback of its own.
- **The map grid is content-plus-margin, not just content** — `lib/mapGrid.ts`'s
  `CONTENT_COLS`/`CONTENT_ROWS` (26x14, unchanged) is the area
  `DEFAULT_WORLD_LAYOUT` was actually hand-tuned against; `MARGIN_COLS`/
  `MARGIN_ROWS` (10 cells each side) is pure grass buffer added around
  it, and `FRAME_COLS`/`FRAME_ROWS` (46x34 — what `MapViewport` actually
  fits-to-screen) is content+margin combined. `lib/worldLayout.ts`'s
  `gridRow`/`gridCol` do the existing percent→`CONTENT_COLS/ROWS`
  conversion and then add the margin offset, so every default
  position/marker/building shifted by exactly `(MARGIN_ROWS,
  MARGIN_COLS)` — recentered, zero change to relative arrangement. This
  replaced an earlier, rejected idea (letting `MapViewport` zoom out
  below "fit" for breathing room) — that would let a user zoom out far
  enough to see the dark background beyond the grid's true edge, which
  is explicitly not wanted; real margin *inside* the grid, combined with
  capping zoom-out at exactly fit (`MIN_ZOOM_MULT` 0.5→1 in
  `MapViewport.tsx`), gives the breathing room without ever exposing
  "outside the grid." **Widened further the same day (ninth session)**:
  `MARGIN_COLS` 10→18 (kept `MARGIN_ROWS` at 10 — horizontal-only, per
  what was actually reported: "extend the borders horizontally... you
  can barely fit all the icons without cropping"), so `FRAME_COLS` is
  now 62 (`FRAME_ROWS` still 34) — a wider, more landscape-shaped frame
  closer to typical monitor aspect ratios. See the new Active TODOs
  entry for the one real consequence: a saved layout tuned against the
  narrower margin doesn't auto-recenter.
- **Two-finger pinch could leave a stray click-suppressor that silently
  broke the very next click anywhere on the map — including Fit**
  (2026-09-16, ninth session, "the fit button just makes the whole
  screen go blank"). Root cause, found by reproducing live with a real
  two-pointer pinch (synthetic zero-effort clicks never triggered it —
  simple wheel-zoom-then-click and drag-then-click repros both worked
  fine, which is why this survived the eighth session's own testing):
  `MapViewport.tsx`'s `handleUp` hands a pinch off to a fresh single-
  finger "pan" gesture when the first of the two fingers lifts (so the
  camera keeps following the remaining finger instead of snapping) —
  but it hardcoded that handed-off gesture's `moved: true`. When the
  user's *second* finger then lifts with no further movement (the
  overwhelmingly common case — pinches usually end with both fingers
  just lifting together), `handleUp` sees a `"pan"` gesture with
  `moved: true` ending on that pointer and installs the capture-phase
  click-suppressor meant for "a real drag just ended here" — except no
  real drag happened after the handoff, so the suppressor sits there and
  eats whatever the user clicks next, wherever that is (Fit, a real
  button, an empty tile). Fixed by starting the handed-off gesture at
  `moved: false` instead — it only becomes a real (suppression-worthy)
  pan if the remaining finger actually moves past `DRAG_THRESHOLD_PX`
  after the handoff, exactly like any other pan gesture. **Lesson**: a
  gesture-state bug that depends on the exact interleaving of two
  simultaneous pointers lifting won't show up in single-pointer testing
  no matter how thorough — pinch specifically needs its own dedicated
  end-to-end repro (two synthetic pointers down, moved, then both lifted
  with no further motion) before trusting pinch-adjacent code paths.
- **Map editor gained a "📐 Guides" toggle** (ninth session) — a
  `pointer-events-none` overlay, rendered inside the same `MapViewport`
  frame as everything else (so it pans/zooms in lockstep), showing a
  dashed rectangle at the `CONTENT_COLS x CONTENT_ROWS` boundary (offset
  by `MARGIN_COLS`/`MARGIN_ROWS`, mirroring `lib/worldLayout.ts`'s own
  conversion) plus a badge reporting frame dimensions/aspect ratio and
  live zoom%. `MapViewport.tsx` gained an optional `onScaleChange?:
  (info: {scale, fitScale}) => void` prop for this — additive,
  `WorldView.tsx` doesn't pass it — so the editor can report zoom
  *relative to fit* (what "100%" should mean to a user) without
  `MapViewport` needing any awareness of the guide UI itself.
- Removed `TownMap.tsx`'s leftover `DECORATIONS` constant (the 🪵/🪧
  emoji `PixelBlock`s) — a pre-sprite-art relic that was never migrated
  into `WorldLayoutData` and had no reason to still exist once real
  sprite decorations existed.
- **`MapViewport`'s pan is now hard-clamped to the grid's true edge, no
  slack** (tenth session, 2026-09-16 — "they shouldn't be able to drag
  out of the pixel art either"). `clampPan`'s old `± PAN_SLACK_PX`
  (120px) let a drag reveal the dark background past the frame — the
  same thing `MIN_ZOOM_MULT=1` already prevented for zoom-out. Replaced
  with the exact bounds: an axis where the frame is `<=` the container
  (only possible on the non-constrained axis at exactly "fit," since
  zoom can't go lower) locks to its centered offset with zero drag
  freedom; otherwise it clamps to `[container - content, 0]`, the
  standard "content can't recede past the container edge" range.
- **Bulk-recenter tool for the map editor** — `shiftLayout(layout,
  deltaRow, deltaCol)` (`lib/worldLayout.ts`) moves every positioned
  item (`decorations`/`extraBuildings`/`scatterHouses`/`wall`/all 5
  `buildingPositions`) by the same delta, preserving every relative
  position (the pathing) exactly. Two ways to trigger it in
  `MapEditor.tsx`: a "🎯 Center Content" button (one click — computes the
  bounding box of everything placed and shifts it so that box's center
  lands exactly on the frame's center) and a small "✥" drag handle at
  the Guides content-area rectangle's center (only rendered/interactive
  while "📐 Guides" is on). The handle is deliberately a small badge, not
  the whole content-area rectangle made draggable — the rectangle itself
  stays `pointer-events-none` (purely visual), because making the whole
  thing a drag target would sit on top of and block normal placement/
  drag-to-move clicks everywhere inside it. This is the direct fix for
  "I don't want to redo all the pathing I've already done" after a
  margin change shifts the frame's center (ninth session's Active TODOs
  entry) — no per-tile re-dragging required.
- **Nano/Hourglass/Bard/laptop-button moved from in-world map objects to
  a fixed right-side toolbar** — `WorldLayoutData.markers` (and
  `MarkerKey`) removed entirely, not deprecated; an old saved row that
  still has a `markers` key is harmless (`isValidWorldLayoutData` never
  rejected on *extra* unrecognized fields, only missing required ones,
  so this is a backward-compatible removal with no data migration
  needed). New `components/world/WorldToolbar.tsx` — a `fixed right-4
  top-1/2` vertical dock owning the `openPanel` state and
  `useWindowManager()`/panel-rendering logic moved out of `TownMap.tsx`
  verbatim, rendered as a sibling of `MapViewport` in `WorldView.tsx`
  (not inside it — these are screen-fixed UI now, like the existing
  Fit/Tools/Guides controls, not part of the pannable/zoomable map).
  `TownMap.tsx` shrank to just `{townState, layout}` props and no longer
  needs `useWindowManager` at all, which let `MapEditor.tsx` drop its
  `WindowManagerProvider` wrapper around the preview `TownMap` too
  (nothing inside it calls that hook anymore). The map editor doesn't
  get its own toolbar preview — it's fixed screen chrome, not part of
  the map being designed. This is a real reversal of the sixth/seventh
  sessions' "make markers movable/positioned-on-the-map" work, which is
  fine — that work is superseded, not wasted; the drag-gesture patterns
  it established (`startSingleDrag`, etc.) are still used by the 5 fixed
  buildings.
- **A second, independent Fit-button bug, found after the click-jitter
  fix above didn't fully resolve it** (twelfth session, 2026-09-16 — "the
  fit button still doesn't work, it teleports the view over to the
  left"). Root cause: `MapViewport.tsx`'s `measure()` used
  `el.getBoundingClientRect()` — the *visually rendered* box after all
  CSS transforms — to compute `containerSize`. `WorldView`'s `MapViewport`
  mounts for the first time at the exact instant `LaptopFrame.tsx`'s lid-
  opening animation *starts* (`switchView`'s `setView(next)` and
  `setLidPhase("opening")` fire in the same tick; `app/globals.css`'s
  `lid-open` keyframe runs `rotateX(-100deg) → rotateX(0deg)` over 280ms
  under `perspective: 1600px` on an ancestor). The synchronous initial
  `measure()` call in `useEffect` therefore reads
  `getBoundingClientRect()` while the element is still nearly edge-on
  mid-rotation, getting a wildly distorted width/height — and nothing
  ever corrects it afterward, since `ResizeObserver` only fires on real
  layout-box size changes, and `rotateX`/`perspective` are purely
  compositing effects that never touch layout. This poisoned
  `fitTransform` for the entire lifetime of that mount, reproducing on
  *every* transition into World view (not intermittent — matches the
  user hitting it consistently). The map editor was never affected
  (no lid/perspective animation on that route), which is why it tested
  fine every previous round. Fixed by switching `measure()` to
  `el.clientWidth`/`el.clientHeight` — pure layout-box dimensions,
  completely unaffected by `transform`/`perspective` on the element or
  any ancestor, at any point mid-animation. `zoomAt`/the drag/pinch
  handlers correctly keep using `getBoundingClientRect()` (they need
  real viewport-relative cursor coordinates, and only ever run well
  after the 280ms animation has settled from genuine user interaction),
  so those were intentionally left unchanged. **Lesson**: a `useEffect`
  that measures a DOM node synchronously on mount, in a component that
  might mount while an ancestor's CSS transform/animation is active,
  should prefer `clientWidth`/`clientHeight`/`offsetWidth`/`offsetHeight`
  (layout-box, transform-immune) over `getBoundingClientRect()`
  (rendered-box, transform-sensitive) unless real viewport coordinates
  are specifically what's needed.
- **"Fit" now targets the content area, not the full margin-inclusive
  frame — two-tier fit targets** (thirteenth session, 2026-09-17 — "the
  fit button still doesn't zoom as close as the guide says it should,
  both should match. in addition, the user can still zoom out to see
  past the map now"). Previously `MapViewport.tsx` had one `fitTransform`
  sized to the full `FRAME_COLS x FRAME_ROWS` grid (content + the
  `MARGIN_COLS`/`MARGIN_ROWS` buffer), so clicking Fit landed on a looser,
  more-zoomed-out view than the map editor's "📐 Guides" dashed rectangle
  (which marks `CONTENT_COLS x CONTENT_ROWS`) implied — the zoom% badge
  never actually read 100% at the state a user would call "fit." Replaced
  with two targets from one generic `transformFor(containerW, containerH,
  targetW, targetH)` helper, both centered on the same point (content is
  symmetrically centered inside the frame by construction, so no
  special-casing needed): `contentFit` (targets `CONTENT_WIDTH_PX x
  CONTENT_HEIGHT_PX`) is the new initial auto-view and what "⤢ Fit"
  resets to, and reported as `fitScale` via `onScaleChange` (so the
  editor's zoom% badge now reads 100% exactly at the Guides rectangle);
  `frameFit` (targets the full frame, unchanged in meaning from the old
  single `fitTransform`) is now purely the zoom-out floor —
  `MIN_ZOOM_MULT` multiplies `frameFit.scale`, not `contentFit.scale`, so
  the tighter new default has real room to zoom out into (revealing the
  margin) before stopping exactly at the true grid edge, same guarantee
  as before. `MAX_ZOOM_MULT` (zoom-in ceiling) now multiplies
  `contentFit.scale` instead of the old `fitTransform.scale`.
  `clampPan` needed no change — it already clamps against
  `FRAME_WIDTH_PX`/`FRAME_HEIGHT_PX` regardless of which fit target is
  active. Live-verified on both the map editor (Guides rectangle now
  exactly fills the canvas at Fit, badge reads 100%; wheel/drag zoom-out
  stops firmly at the frame edge, no dark background) and the live "View
  Kingdom" screen (initial auto-fit matches the editor's tighter default;
  wheel zoom-out floors at the full frame with only natural letterboxing;
  "⤢ Fit" correctly returns to content-fit from a zoomed-out state).
  **Testing note**: dispatching several rapid synthetic `WheelEvent`s and
  reading the transform back in the *same* browser-automation script
  block raced React's commit and looked like a no-op — splitting reads
  into separate calls (real time passing) confirmed the actual clamped
  value matched the hand-computed `frameFit.scale` exactly. A `computer`
  tool coordinate-click on "⤢ Fit" also silently missed once; a direct
  `element.click()` via `javascript_tool` on the same button worked
  immediately — likely just an imprecise click coordinate, not a
  functional issue.

- **The zoom-out floor "covers" the container instead of "containing" the
  frame — eliminates all letterboxing** (fourteenth session, 2026-09-17 —
  "ok the fit button works, but the user is still able to zoom out past
  the map", with a screenshot showing dark vertical bars on both sides at
  the zoomed-out floor). Reproduced live and confirmed via direct DOM
  read that this was **not** a pan/clamp bug — the prior round's
  `frameFit` (the zoom-out floor) correctly computed a "contain" fit of
  the full `FRAME_COLS x FRAME_ROWS` grid and `clampPan` correctly
  centered it (`tx`/`ty` matched the hand-computed centered offset
  exactly, symmetric on both sides). The dark bars were real, *intentional*
  letterboxing: whenever the container's aspect ratio doesn't exactly
  match the frame's (≈1.82, essentially never true for a real browser
  window), "contain" leaves slack on one axis, and that slack renders the
  container's own `#1f4530` background — which the user (reasonably)
  experiences as "seeing past the map," even though no pixel past the
  frame's *logical* edge was ever exposed. Fixed by giving `transformFor`
  a `mode: "contain" | "cover"` parameter (`"contain"` unchanged as the
  default, still used by `contentFit`) and computing the zoom-out floor —
  renamed `frameFit` → `zoomFloor` — with `mode: "cover"`
  (`Math.max(...)` instead of `Math.min(...)`, same centering math
  otherwise): the frame now always fills the container completely on
  both axes at the floor, cropping into its own grass margin
  (`MARGIN_COLS`/`MARGIN_ROWS`) on whichever axis has less slack instead
  of leaving it empty — margin crop, never a dark background. `MIN_ZOOM_MULT`
  now multiplies `Math.min(zoomFloor.scale, contentFit.scale)`, a defensive
  clamp (not expected to trigger given the frame's and content's aspect
  ratios are close — 1.82 vs 1.86 — but guards the theoretical skewed-
  container case where "cover the frame" could end up tighter than the
  default "contain the content" view). `contentFit`, `MAX_ZOOM_MULT`,
  `onScaleChange`'s `fitScale`, the initial auto-view, `resetToFit`, and
  `clampPan` were all untouched — none of them depended on the floor's
  "contain" semantics. Live-verified on both the live "View Kingdom" view
  and the map editor: wheel-zoomed to the new floor, screenshot showed
  grass/water filling every edge with zero dark background; a 3000px
  synthetic drag attempt at the floor stayed fully clamped (the
  zero-slack axis didn't move at all, the slack axis clamped exactly at
  the frame's real edge); "⤢ Fit" still correctly returns to the
  unchanged `contentFit` view afterward.

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

- Sprite pipeline: all 5 `BuildingKey`s have real stage art, now stored
  in `WorldLayoutData.buildingStageSprites` (user-editable via
  `/dev/map-editor`) rather than the old static `BUILDING_STAGE_SPRITES`
  constant, which no longer exists. No distinct "ruins" sprite was
  located in the rows inspected (1-10, 25-31) — the red-X/blue-O tiles
  there are overworld map-node markers from this pack's strategy-map
  screen, not a ruined building; a real one may exist in the unexamined
  rows 11-24/32-45 but nothing needs it yet.
- **The World map's paths still don't look good** — `DEFAULT_WORLD_LAYOUT`
  carries over the same computed-diagonal `road_dirt_junction`/
  `road_dirt_bend`/`road_stone_junction` placements the user was
  mid-complaint about when `/dev/map-editor` was built (2026-09-15 fifth
  session). The tool to fix this by hand now exists, buildings are on the
  same grid-cell coordinate system as everything else (sixth session),
  and as of the seventh/eighth sessions the map is a genuinely
  fixed-frame, fit-to-any-screen viewport with real pan/zoom — every
  structural blocker to redesigning the paths by hand is now cleared.
  Nobody has actually redesigned them yet.
- The seventh session's "match the editor canvas's real pixel dimensions
  to the live view's" WYSIWYG approach is **superseded** by the eighth
  session's fixed-frame `MapViewport` (see Architecture Decisions) — both
  now show the identical logical `FRAME_COLS x FRAME_ROWS` content at
  whatever scale fits their own container, so they no longer need
  matching container dimensions at all. Nothing from the seventh
  session's editor-layout work (top bar, floating tools drawer, "Placing:
  X" badge) was undone — only the canvas's own sizing/scaling mechanism
  changed underneath it.
- **Resolved (tenth session)**: the real account's saved `WorldLayout`
  row (current-shape, loading live since sometime after the seventh
  session — confirmed by its 28 decorations/hand-edited roads, not
  `DEFAULT_WORLD_LAYOUT`'s 31) sat left-of-center after the ninth
  session's `MARGIN_COLS` widening, since a saved row's `row`/`col`
  values are absolute and don't auto-recenter when the margin changes.
  Rather than attempt an unreliable automatic migration, the map editor
  gained a real bulk-recenter tool (`shiftLayout` in `lib/worldLayout.ts`,
  the "🎯 Center Content" button, and a draggable content-area handle
  under "📐 Guides" — see Architecture Decisions) so the user fixes this
  themselves in one click/drag without re-placing anything. **Not yet
  saved**: this was verified live in the editor (Center Content snapped
  the real content into the guide rectangle correctly) but the session
  never clicked Save, so the persisted DB row is still in its pre-
  recenter state — the fix is available whenever the user opens the
  editor and wants to apply + save it.
- Expired-custom-start-date auto-revert: the completed-task interaction
  (falls back to `completedAt` instead of today) and the live
  60s-interval day-rollover path are unverified live (code-reading only —
  see 2026-09-13 session log).
- Gamification: currency spend/shop UI and cosmetics are deliberately
  deferred. `announcementFound` mascot trigger has never fired against a
  real batch. Light-theme rendering of `WorldView`/`TownMap`/
  `OnboardingOverlay`, and `TownMap`'s layout at ~400px width, are
  unchecked. Laptop frame's minimum usable height on a short browser
  window is unchecked (no floor anymore).
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
- Task-field overrides: only `typeOverride`/`dueAtOverride` were clicked
  through end-to-end (see 2026-09-14 due-date-revert fix session);
  `nameOverride` still verified only via tsc/lint/build.
- Announcement pipeline reliability/cost changes (RULES dedup,
  concurrency cap, bisection retry, longer timeout, per-entry
  degradation, number-based matching, false-positive bias) haven't been
  re-exercised together against a live run since landing.
- Announcement time-range preset UI (preset switching, custom date
  pickers, the >15 soft-warning) hasn't been separately click-tested.
- Restore-a-deleted-Canvas-course flow is only verified via syntax/tsc/
  lint/build, not a real extension reload/click-through.
- Announcement-analysis polish (HTML-safe rendering, due-date resolution,
  persisted accept/reject, "check unavailable" status) — evidence
  highlighting/auto-scroll and inline name/course/type editing are now
  live-verified against Ollama (see 2026-09-14 second session log); the
  rest of this list is still only code-reading-verified.
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

### 2026-09-16 (twelfth session) — Fix the real Fit-button bug: measuring the container mid-animation

Follow-up to the eleventh session, same day. "The fit button still
doesn't work, it teleports the view over to the left" — with a
screenshot showing the right-side toolbar over mostly dark background
and only a thin sliver of grass, confirming the eleventh session's
click-jitter fix (a real bug, but a different one) hadn't fully resolved
the underlying problem.

Diagnosed via static analysis this time (not live reproduction first) —
traced `LaptopFrame.tsx`'s `switchView` + `app/globals.css`'s
`lid-open`/`lid-close` keyframes together and found `MapViewport` always
mounts at the exact instant the lid's 3D `rotateX` animation starts,
while `measure()` was reading `getBoundingClientRect()` (transform-
sensitive) instead of `clientWidth`/`clientHeight` (transform-immune).
Full technical account in Architecture Decisions' new "A second,
independent Fit-button bug" entry — worth reading before touching
`MapViewport.tsx`'s measurement code again.

Fix: `measure()` now uses `el.clientWidth`/`el.clientHeight`. One-line
change, `components/world/MapViewport.tsx` only.

Verified: `npx tsc --noEmit -p .`/`npm run lint` clean. Live in Chrome:
triggered the *real* animated OS→World transition (not a direct URL
navigation, which wouldn't reproduce this) multiple times in a row —
the map now renders correctly fit on the very first frame every time,
with Fit itself now a true no-op when already fit. Also did a full
World→OS→World round trip to confirm the fix holds across repeated
mounts, not just the first one this session happened to check.

### 2026-09-16 (eleventh session) — Hard-lock panning to the grid, bulk-recenter tool for the editor, move Nano/Hourglass/Bard/laptop to a fixed side toolbar

Follow-up to the tenth session, same day. Three reports: "they can no
longer zoom out of the pixel art but they shouldn't be able to drag out
of the pixel art either"; "give me the ability to move the content area
and have all of the background automatically move to center around it
... i don't want to spend the effort to have to REDO all the pathing
i've already done"; "make the open the laptop button, nano, the bard,
and the hourglass buttons all on a toolbar on the side rather than
buttons on the map." Confirmed the toolbar side via `AskUserQuestion`:
right.

- `MapViewport.tsx`'s `clampPan`: removed `PAN_SLACK_PX`, replaced with
  exact "can't recede past the container edge" bounds (locks to centered
  offset when the frame is smaller than the container on that axis).
  Full rationale in Architecture Decisions.
- New `shiftLayout()` (`lib/worldLayout.ts`) plus two ways to trigger it
  in the editor: "🎯 Center Content" (one click, snaps everything's
  bounding-box center to the frame's center) and a small draggable "✥"
  handle at the Guides content-area rectangle's center (deliberately not
  the whole rectangle, to avoid blocking normal placement clicks inside
  it).
- `WorldLayoutData.markers`/`MarkerKey` removed entirely (backward-
  compatible — see Architecture Decisions on why no migration was
  needed). New `components/world/WorldToolbar.tsx`, a fixed right-edge
  dock for Nano/Hourglass/Bard/laptop, rendered as a sibling of
  `MapViewport` in `WorldView.tsx` rather than inside `TownMap.tsx`.
  `TownMap.tsx`'s props shrank to `{townState, layout}`; it no longer
  uses `useWindowManager`, which let `MapEditor.tsx` drop its
  `WindowManagerProvider` wrapper around the preview `TownMap`.

Verified: `npx tsc --noEmit -p .`/`npm run lint` clean. Live in Chrome:
zoomed in and dragged far past every edge (a huge, deliberately
excessive drag distance) on both the editor and the live view — the
dark background never appeared, confirming the hard clamp. Turned on
Guides, dragged the "✥" handle and confirmed every decoration/building/
wall/path moved together with pathing intact; clicked "Center Content"
separately and confirmed it snapped the real account's actual (left-of-
center) saved layout into the guide rectangle correctly — not saved to
the DB this session (no Save click), so this is ready for the user to
apply next time they're in the editor. Confirmed Nano/Hourglass/Bard/
laptop no longer render on the map itself and instead appear as a
right-side dock on the real "View Kingdom" screen; clicked Hourglass and
confirmed its panel still opens correctly next to the dock.

### 2026-09-16 (tenth session) — Fix a real pinch-then-Fit bug, remove leftover emoji, widen the frame horizontally, add an editor grid/aspect-ratio guide

Follow-up to the ninth session, same day. Four reports: "fit button just
makes the whole screen go blank"; "remove the random sign and wood emoji
on the map"; "extend the borders horizontally a bit more, because you
can barely fit all the icons on the screen without cropping it off";
"the editor view should also have a way to see the aspect ratio and
stuff."

- **The Fit bug was real and specific to pinch gestures** — full
  technical account in Architecture Decisions' new "Two-finger pinch
  could leave a stray click-suppressor" entry. Diagnosed by reproducing
  live rather than guessing from code: plain wheel-zoom-then-Fit and
  drag-then-Fit (both via real mouse actions, not synthetic
  zero-movement clicks) worked fine on the first two attempts, which
  ruled out the click-suppression mechanism *in general* — only a
  two-pointer pinch-then-Fit sequence actually reproduced it. One-line
  fix once found (`moved: true` → `moved: false` on the pinch→pan
  handoff in `MapViewport.tsx`'s `handleUp`).
- Removed `TownMap.tsx`'s `DECORATIONS` constant (🪵/🪧 emoji) entirely.
- `lib/mapGrid.ts`: `MARGIN_COLS` 10→18 (horizontal-only, per what was
  actually reported), `MARGIN_ROWS` unchanged at 10 — `FRAME_COLS` is
  now 62 (`FRAME_ROWS` still 34).
- New "📐 Guides" toggle in `/dev/map-editor` — a dashed rectangle at the
  `CONTENT_COLS x CONTENT_ROWS` boundary plus a frame-dimensions/aspect-
  ratio/zoom% readout, both rendered inside the same `MapViewport` frame
  so they track pan/zoom. `MapViewport.tsx` gained an additive
  `onScaleChange` prop for the zoom readout (unused by `WorldView.tsx`).
- Discovered along the way (not caused by this session): the real
  account now has an actual current-shape saved `WorldLayout` — the user
  saved through the editor themselves at some point after the seventh
  session. This means the `MARGIN_COLS` widening in this session shifts
  their already-saved content left-of-center in the frame (saved `row`/
  `col` values are absolute, not recomputed) — documented as a new
  Active TODOs entry rather than attempting an automatic migration.

Verified: `npx tsc --noEmit -p .`/`npm run lint` clean. Live in Chrome:
reproduced the exact blank/stuck-zoom bug with a real two-pointer pinch
sequence followed by a real Fit click *before* fixing it (confirming the
diagnosis, not just testing the fix in isolation), then confirmed the
same repro resolves correctly after the fix, on both the live "View
Kingdom" screen and the editor. Confirmed the 🪵/🪧 emoji no longer
render anywhere. Confirmed the frame is visibly wider with the new
Guides overlay showing "62x34 cells · 62:34 ratio · zoom 100%" and the
dashed content boundary tracking correctly. Also noticed (unrelated to
this session's changes, real account's own data) that the currently
saved layout has a different road arrangement than
`DEFAULT_WORLD_LAYOUT` — consistent with "the user has been actively
editing and saving through the tool themselves."

### 2026-09-16 (ninth session) — Fix the Fit button, add real grass margin around the map, cap zoom-out at the grid edge

Follow-up to the eighth session, same day. Three connected reports: "the
fit button doesn't work"; "the ratios of the field are so that it won't
fit on any screen ratio"; "make a bunch more leeway away from the main
area so that a user can zoom out farther... the user should not be able
to zoom out far enough that they can see outside of the grids."

- **Fit button bug, root cause and fix**: full account in Architecture
  Decisions' new "Every interactive element..." entry. Short version —
  real buttons inside `MapViewport`'s tree never called
  `stopPropagation()` on their own `pointerdown` (only placement handles
  already did, for an unrelated reason), so ordinary click jitter got
  misread as a pan-drag and the button's own click got swallowed by
  `MapViewport`'s own click-suppression. My prior session's live testing
  never caught this because every synthetic test click used exactly zero
  pixels of movement — added a *jittery* click test this session
  (pointerdown → move a few/15+ px → pointerup → click, all targeting
  the same button) specifically to reproduce what a real mouse actually
  does, which is what exposed it. Fixed on the Fit button, TownMap's
  Hourglass/Bard/laptop buttons, and once each on
  `HourglassPanel`/`BardPanel`'s root (covers every button inside).
- **Grid grew from 26x14 (content only) to 46x34 (content + a 10-cell
  grass margin on every side)** — `lib/mapGrid.ts` split into
  `CONTENT_COLS`/`ROWS` (unchanged, what `DEFAULT_WORLD_LAYOUT` was
  tuned against) and `MARGIN_COLS`/`ROWS`; `lib/worldLayout.ts`'s
  `gridRow`/`gridCol` now add the margin offset after their existing
  percent conversion, so the default layout shifted to sit centered in
  the bigger grid with zero change to its own relative arrangement.
  `MapViewport.tsx`'s `MIN_ZOOM_MULT` 0.5→1, so zoom-out is capped at
  exactly "fit" (the whole content+margin grid) — deliberately not
  "zoom below fit for breathing room," which would expose the dark
  background beyond the grid's real edge, the opposite of what was
  asked. Full rationale in Architecture Decisions.

Verified: `npx tsc --noEmit -p .`/`npm run lint` clean. Live in Chrome:
reproduced the exact Fit-button bug with a 20px-jitter synthetic click
sequence *before* confirming the fix (not just testing the fix in
isolation), then confirmed the same fix on the live view's Hourglass
button with 15px of jitter. Confirmed the grid resized to 2208x1632px
(46x34 @ 48px) and the default layout now shows clear grass margin
around every building on both the editor and the real "View Kingdom"
screen. Confirmed wheel-zoom-out no longer moves the scale below fit no
matter how much negative-direction wheel input is sent.

### 2026-09-16 (eighth session) — Fixed-size map frame with real pan/zoom, replacing container-matching WYSIWYG

Follow-up to the seventh session, same day. The user's report: "different
size screens will warp the map differently, so we should make it so that
the maps is able to zoom in and zoom out, and there's a minimum frame
that will always be visible no matter the size of the screen, then i
just have to guarantee that my buildings all fit there. the map should
also get smaller on smaller screens." Diagnosis (in Plan Mode): the
seventh session's WYSIWYG fix made the editor's canvas match the *live
view's* container dimensions, but neither one was consistent across
*different devices* — the ground was still an oversized, fixed-pixel
grid clipped by `overflow-hidden`, so a small screen genuinely saw fewer
columns/rows than a large one. Asked one clarifying question
(`AskUserQuestion`) about whether manual zoom belonged on the live view
too, not just the editor; the user's answer ("scroll to zoom, drag to
move on PC, pinch to zoom on mobile") turned out to specify real
interaction requirements for both, not just confirm scope — the plan was
revised around that before implementation.

- New `components/world/MapViewport.tsx` (full design in Architecture
  Decisions) — the shared fixed-frame-scaled-to-fit-plus-pan/zoom
  viewport now wrapping the map in both `WorldView.tsx` and
  `MapEditor.tsx`.
- `lib/mapGrid.ts`: `GROUND_COLS`/`GROUND_ROWS` (60x30, an oversized
  backdrop) renamed to `FRAME_COLS`/`FRAME_ROWS` (still 26x14 — now the
  *entire* map, exactly) plus new `FRAME_WIDTH_PX`/`FRAME_HEIGHT_PX`.
- `TownMap.tsx`: stopped being a responsive `h-full w-full` component —
  now a fixed `FRAME_WIDTH_PX x FRAME_HEIGHT_PX` block; the ground loop
  shrank from 1800 cells to 364 (every cell now always-visible, not
  wasted off-screen area); the two remaining percent-positioned elements
  (`DECORATIONS`' log/sign emoji, the Hourglass/Bard's `openPanel`
  overlay) converted to fixed pixel math against the frame's own
  dimensions.
- `MapEditor.tsx`: canvas area restructured around `<MapViewport>`
  wrapping both the live preview and the interactive overlay as stacked
  children; `clientToGrid` simplified from `GRID_PX`-based pixel division
  to ratio math against the overlay's own (now pan/zoom-aware)
  `getBoundingClientRect()` — correct at any zoom/pan state automatically,
  no explicit transform bookkeeping needed in the click math.
- One real bug found and fixed during live pinch testing (multi-pointer
  `pointerId` mixup during a pan-to-pinch transition race) — full account
  in Architecture Decisions, worth reading before touching
  `MapViewport.tsx`'s gesture code again.

Verified: `npx tsc --noEmit -p .` and `npm run lint` clean (only the same
pre-existing, unrelated errors elsewhere). Live in Chrome: confirmed all
5 buildings/wall/markers visible by default with the tools drawer closed
(no scrolling); wheel-zoom-toward-cursor via a dispatched `WheelEvent`
(scale 1.71 → 2.69 → back to fit via the new "⤢ Fit" button); a real
drag-then-click sequence correctly panned and did *not* place a tile,
while a tap-then-click correctly did (both via directly-dispatched
`PointerEvent`+`click` sequences, confirming the click-suppression logic
specifically, not just that panning moves the view); two-pointer pinch
correctly scaled by the exact distance ratio (100px→300px spread tripled
the scale, 1.71×3=5.14, matching exactly) after the pointerId-mixup fix;
resize-responsiveness confirmed correct via direct element/window-resize
manipulation plus a debug log, after several *apparently* failed
attempts turned out to be a read-too-fast artifact of this environment's
backgrounded-tab timing (see Architecture Decisions' new lesson entry) —
worth remembering before concluding a similar test failed for real. Real
`<button>`s (Hourglass) confirmed still clickable through the new
viewport layer on the actual "View Kingdom" screen, not just the editor.

### 2026-09-16 (seventh session) — True WYSIWYG map editor, movable UI markers, freeform extra buildings, real multi-tile handle sizing, multi-sprite-pack support

Continuation of the sixth session's grid-cell fix. The user's next
message reframed the whole problem: "there's only one building in the
map automatically, and you can't drag any new ones into the map. there's
also no option to edit the buildings if the buildings need more than one
tile... i might also add more sprite packs in the future." Planned this
properly (plan mode) rather than patching the visible symptom — see
Architecture Decisions above for the full technical account of each
piece; this entry covers what changed and why, and how it was verified.

Mid-planning, the user corrected the diagnosis before implementation
started: "actually i realized the issue is that the map in the edit view
doesn't show the full map that would have been on the planner view... also
make it so that i can move the buttons as well." That reframed "only one
building shows" from a coordinates problem into a canvas-size problem —
confirmed by reading `app/page.tsx` → `LaptopFrame.tsx` → `WorldView.tsx`
and finding the real view renders `TownMap` at full browser viewport
size, nothing like the editor's old fixed 640px-tall box. The plan was
rewritten around that before any code was touched.

Five changes landed together:
1. Full-viewport WYSIWYG canvas + floating tools drawer (replaces the old
   two-column layout) — the actual fix for "only one building shows."
2. `WorldLayoutData.markers` — Mascot/Hourglass/Bard/laptop button
   positions, previously hardcoded, now drag-editable via a new Markers
   tab.
3. `WorldLayoutData.extraBuildings` — freeform building placement,
   additive to the 5 fixed growth buildings, managed from the same
   Buildings tab.
4. Real multi-tile drag-handle sizing for the 5 fixed buildings
   (previously a hardcoded 3x3 guess).
5. Multi-sprite-pack support via a code registry (`lib/spriteSheets.ts`)
   — confirmed with the user via `AskUserQuestion` that an in-app upload
   UI is out of scope (no writable image storage at runtime in this app).

Verified: `npx tsc --noEmit -p .` clean (one real type error surfaced
and fixed along the way — `TileSprite.tsx`'s `name ? SPRITE_COORDS[sheet][name]
: coord` ternary stopped narrowing `coord` to non-`undefined` once the
`{sheet}` field was intersected onto the existing discriminated-union
props type; destructuring apparently breaks that correlation in this
case, so resolved with an explicit `as SpriteCoord` assertion rather than
fighting the narrowing further — worth remembering if this recurs
elsewhere). `npm run lint`: confirmed zero errors in any file this
session touched (the 19 pre-existing `react-hooks/set-state-in-effect`/
`no-explicit-any` errors are all in files untouched this session,
explicitly diffed to confirm). Live-verified in Chrome: `/dev/map-editor`
now shows all 5 buildings, the wall, and every decoration/marker with the
Tools drawer closed — confirmed via screenshot before vs. after closing
the drawer, no scrolling needed. Dragged a fixed building, an extra
building (added via canvas click, confirmed footprint sizing on
Watchtower's `castle_wall` stage — a ~288px-wide handle, not the old
144px guess), and a marker (The Bard), each via directly-dispatched
`PointerEvent`s (per the established lesson that the browser-automation
drag tool doesn't fire real ones) — all three repositioned and snapped
correctly. Loaded the real "View Kingdom" World view afterward and
confirmed it renders identically to the editor's own preview (same
buildings/markers/decorations, same relative positions) — the actual
end-to-end WYSIWYG check this whole session was for.

One thing discovered, not caused, this session: a `WorldLayout` DB row
already existed for the real account (sixth session's old shape,
missing `extraBuildings`/`markers`) — see the new Active TODOs bullet.
`isValidWorldLayoutData` correctly rejected it and the app fell back to
`DEFAULT_WORLD_LAYOUT` everywhere, exactly as designed; nothing broke,
but it's worth knowing that row is sitting there stale until the next
real Save.

### 2026-09-15 (sixth session) — Fix building/grid misalignment: switch placements from percent to grid-cell coordinates

Follow-up to the fifth session's editor bug fixes. The user's next report
("the snapping is working, but the cities are not aligned on the grid, so
the paths don't match up") turned out not to be a small bug but a real
design flaw in the previous fix, caught via `advisor` before writing any
code: percent-of-container was always the wrong storage unit for a fixed-
pixel grid, so grid-snapping in the editor could only ever be correct at
the one container width it was performed at — full technical account in
Architecture Decisions' new "Placements are stored as grid row/col" entry.

- New `lib/mapGrid.ts` (shared `GROUND_TILE_PX`/`GROUND_COLS`/
  `GROUND_ROWS`, previously duplicated as local consts in `TownMap.tsx`
  and mirrored as a comment-referenced value in `MapEditor.tsx`).
- `types/worldLayout.ts`: `PlacedTile.top`/`left` (percent) replaced with
  `row`/`col` (grid cells); added `WorldLayoutData.buildingPositions:
  Record<BuildingKey, {row, col}>` — buildings are now part of the
  editable layout for the first time, specifically so they can be
  grid-aligned like everything else.
- `lib/worldLayout.ts`: `isValidPlacedTile`/`isValidWorldLayoutData`
  updated for the new shape; `DEFAULT_WORLD_LAYOUT` ports every old
  percent number through a documented one-time `toGrid()` conversion
  rather than by hand.
- `TownMap.tsx`/`Building.tsx`: render straight off `row * GROUND_TILE_PX`/
  `col * GROUND_TILE_PX` (numbers, not percent strings) — no scaling with
  container width anywhere in the placement path anymore, matching how
  the ground itself already rendered.
- `MapEditor.tsx`: replaced `snapToGridPercent` with `clientToGrid`
  (returns integer `row`/`col` directly, no percent round-trip); added a
  Buildings-tab canvas overlay with the same drag-to-reposition/snap
  handles as decorations/scatterHouses/wall (`startBuildingDrag`,
  `updateBuildingPosition`), plus a minimal "Selected building" sidebar
  panel (row/col display only — no scale/delete, since the 5 buildings
  are a fixed set).

Verified: `tsc --noEmit` and `eslint` clean (confirmed no new errors in
any touched file; the full-repo lint run's ~16 errors are pre-existing
`react-hooks/set-state-in-effect` issues in unrelated files, same as
noted in the fifth-session entry). Checked for a saved `WorldLayout` DB
row before changing the schema shape — none existed yet for the real
account, so there was no old-shape row to migrate or worry about
`isValidWorldLayoutData` rejecting. Live-verified in Chrome: opened
`/dev/map-editor`, confirmed decorations/paths/library building render at
their expected converted grid positions; switched to the Buildings tab
and dragged the Library building via a directly-dispatched `PointerEvent`
sequence (per the established lesson that the browser-automation drag
tool doesn't fire real ones) — the sidebar panel correctly reported the
new `row`/`col`, and the building rendered exactly at that grid cell.
Also loaded the real "View Kingdom" World view (not just the editor) and
confirmed the Library building renders at the same relative position as
in the editor, with the ground/decorations/buildings all visually
consistent — the cross-view alignment this whole fix was for. Did not
save the test drag (no `Save` click), so the real account's (currently
default) layout is untouched.

**Not done this session**: still nobody has redesigned the actual paths
using the tool — that remains the next real task, and building alignment
was the last structural blocker to it.

### 2026-09-15 (fifth session) — Replace hardcoded terrain with a real visual map editor

After round 5 of "the path still doesn't look right" (a screenshot showing
the computed diagonal path reading as scattered debris — "does it look
like it connects to you?"), the user asked for a different kind of fix
entirely: not another coordinate tweak, but a tool. "Make a tool for me
where I can design the map... give it a placement UI where I can select
any tile from the sprite sheet." Two interaction choices confirmed via
`AskUserQuestion` before building: full drag-and-drop (not click-then-
type-numbers) for repositioning, and click-one-cell-then-widen/heighten
(not click-and-drag rectangle select) for multi-cell sprites.

- New `WorldLayout` Prisma model + migration
  (`20260915225535_add_world_layout`) — one JSON blob per user. Full
  design and rationale (why a blob here and not relational rows, the
  `TileRef` named/raw union, why the editor's canvas needs its own
  `WindowManagerProvider`) is in Architecture Decisions above — this
  entry only covers what changed and why, not the shape.
- `TownMap.tsx` lost every hardcoded terrain/path/scatter-house/wall
  constant (`TERRAIN_DECORATIONS`, `PATH_TILE_STEPS`/`PATH_TILES`,
  `PATH_LINES`, `SCATTER_HOUSES`, the wall's hardcoded sprite) — all now
  read from a `layout: WorldLayoutData` prop. Growth/stage *logic*
  (`computeBuildingStage`, `totalTownGrowth`, milestone gating) and
  building *positions* (`BUILDING_LAYOUT`) were explicitly kept out of
  scope and untouched — only which sprite renders became data.
  `DEFAULT_WORLD_LAYOUT` ports the previous (still-not-great-looking)
  path tiles as-is, on purpose: fixing them is now the user's job via the
  tool, not something to silently improve on their behalf in the port.
- New `/dev/map-editor` (`app/dev/map-editor/page.tsx` +
  `components/dev/MapEditor.tsx`): a sprite-sheet picker (click any of
  the 7×45 usable cells, or a quick-pick grid of already-named sprites;
  two steppers grow a 1×1 pick into a multi-cell one), 5 tabs (Ground,
  Decorations, Buildings, Scatter Houses, Wall), and a live canvas that's
  the real `TownMap` with click-to-place/drag-to-move on top.
- One real integration bug caught before calling it done: the very first
  version crashed on load with "`useWindowManager` must be used within
  `WindowManagerProvider`" — the same pre-existing gap
  `GamificationDevPanel.tsx` already has (documented above), but this
  time it had to actually be fixed (not worked around) since the editor
  *is* a standalone `TownMap` render. Fixed by wrapping the editor's
  canvas in its own `WindowManagerProvider`.

Verified: `tsc --noEmit` clean; `eslint` clean on every file this session
touched or created (a full-repo lint run surfaces ~16 pre-existing
`react-hooks/set-state-in-effect` errors in files already modified before
this session started — confirmed via a lint run scoped to only this
session's files, which came back clean). Live-verified in Chrome: the
real account's World view renders pixel-identical to before immediately
after the refactor (before touching the editor at all) — confirming the
`DEFAULT_WORLD_LAYOUT` port introduced zero visual regression. Then
against `/dev/map-editor` itself: placed a new tile via the picker,
confirmed drag-repositioning via directly-dispatched `PointerEvent`s
(the browser-automation tool's own `left_click_drag` doesn't fire real
pointer events, so it can't exercise this path — worth remembering for
next time), reassigned a ground-theme slot and watched the live preview
update immediately (scattered `mountain_2` across the whole tufted-grass
layer — silly, but it proved the wiring), and confirmed the Buildings tab
matches live game state. Did not save these test edits — reloaded and
confirmed nothing persisted (the editor holds local state until Save, as
designed) and the real account's layout is untouched.

**Not done this session**: nobody has actually redesigned the paths yet
using the tool — the `PATH_TILES`-derived default is still in place and
still doesn't look great. That's the very next thing to do, now that
there's a way to do it by eye instead of by formula.

**Immediate follow-up, same session — two real usability bugs found on
first real use:**

- **"Clicking a tile to select it duplicates it, so delete never works."**
  Root cause: each placement's drag handle called
  `event.stopPropagation()` on `pointerdown` to prevent the canvas's
  "click empty space to add a new tile" handler from firing — but
  `stopPropagation()` on `pointerdown` does nothing to the separate,
  later `click` event the same interaction also fires, which still
  bubbled to the canvas and added a duplicate at the same spot. Fixed by
  also stopping propagation on the handle's own `onClick`. Lesson worth
  keeping: `pointerdown`/`pointerup` and `click` are independent events
  from the same physical click — stopping one doesn't stop the other.
- **"Deleting doesn't work sometimes... the window suddenly pops up, it
  makes me click another tile, creates a new one, and Delete removes
  that one instead."** A second, compounding bug: the "Selected
  placement" edit panel (Scale/Replace/Delete) was conditionally
  rendered in normal document flow *above* the canvas. The instant
  something got selected, that panel's insertion pushed the whole canvas
  down, so the user's next click (aimed at the now-visible Delete button)
  landed wherever the reflow put the canvas instead, registering as "add
  a new tile" — and that accidental new tile became the new selection,
  so Delete removed the wrong thing. Fixed by moving that panel into the
  **left sidebar** (below Quick Picks) instead, which has its own
  independent layout — selecting/deselecting now never moves anything in
  the canvas column. General lesson for this editor: any conditionally-
  rendered element that can appear/disappear based on interaction state
  must never sit in the same flow as a click target, or its own
  appearance becomes the thing that causes the next misclick.
- **"It doesn't snap to grid at all."** Added `snapToGridPercent()`
  (`MapEditor.tsx`) — the real fix has to happen in pixel space, not
  percentage space, since `TownMap.tsx`'s `GROUND_TILE_PX = 48` (the
  ground's actual pixel grid, since the editor renders `TownMap` at 1:1)
  isn't a clean percentage of a variable-width canvas. Applied to both
  new-placement clicks and drag moves via one shared helper.

Verified: `tsc --noEmit`/`eslint` clean. Live-verified all three fixes in
Chrome (selecting no longer duplicates and Delete removes exactly the
selected item; the canvas's `getBoundingClientRect()` is provably
unchanged before/after selecting something; new and dragged placements
land on exact 48px-grid percentages, confirmed by computing the expected
value independently and comparing). Used directly-dispatched
`PointerEvent`/`MouseEvent`s for all of this (per the earlier finding
that the browser-automation drag tool doesn't fire real pointer events)
— and hit a second instance of the same lesson mid-verification: a
`handle.click()` call plus separately-dispatched `pointerdown`/`pointerup`
in the same synchronous script tick didn't reliably reproduce a real
click; dispatching a single native `MouseEvent('click', ...)` on the
actual target element was the reliable way to simulate it.

### 2026-09-15 (fourth session) — World view polish, rounds 3-4: fix tuft striping, real sprite-tile paths, bigger ponds

Two more rounds of direct feedback on the previous session's terrain work
(below), landed together.

- **"The tufts are not random at all"**: the tuft-overlay selector was
  `(row*7+col*13)%11` — small integer coefficients reduced mod a small
  number don't mix bits enough, so it read as an obvious diagonal
  stripe, not scattered. Replaced with `hashCell()`, Thomas Wang's
  32-bit integer hash, still fully deterministic (no `Math.random()` —
  would reintroduce the SSR hydration-mismatch class already documented
  above). Live-verified: no visible periodicity at normal viewing
  distance, same ~9% density as before.
- **"The paths don't actually connect to anything"** (round 3): first
  fix was an SVG `<line>` per Town-Square-to-building connection, using
  `preserveAspectRatio="none"` so every line stays exactly anchored to
  its two endpoints regardless of this map's deliberately unfixed aspect
  ratio (a manually-computed CSS rotation angle from percentage deltas
  would visibly bend/skew whenever the container isn't square — this
  technique is worth reusing for any future drawn-connector geometry on
  this map).
- **"Use the paths in the sprite sheet [rows 10-13]... bigger ponds like
  rows 15-16"** (round 4, right after round 3 shipped): re-inventoried
  those rows with a **grid-overlay crop** (a red 16px grid drawn directly
  onto the exported crop) instead of eyeballing scaled images — this
  caught that the "water" region spans a genuine 3x3 cells
  (`water_pond_big`, col1-3/row14-16, a ring-with-island lake shape), not
  the ~2-cell span an earlier eyeballed pass would have guessed; the
  grid-overlay technique is more reliable than plain scaled crops for
  any future colSpan/rowSpan work and is worth reusing. Replaced the SVG
  line with `PATH_TILES`: 3 real road sprites per connection at fixed
  `t=0.25/0.5/0.75` percentage-lerp points (dirt near Town Square →
  stone near the target building, mirroring a real detail in the sprite
  sheet where `road_dirt_bend` and `road_stone_junction` are drawn to
  sit flush against each other). Caught one real placement bug before
  calling it done: the first `water_pond_big` position landed almost
  exactly on the Town-Square-to-Watchtower path's midpoint tile — new
  terrain placements now need checking against `PATH_TILES`' computed
  percentages, not just the other decoration arrays. Full technical
  account (hash, lerp technique, exact sprite coordinates) now in
  Architecture Decisions.

Verified: `tsc --noEmit` and `eslint` clean on both touched files after
every change. Live-verified in Chrome against the real account: tuft
scatter confirmed non-periodic, all 4 building connections show a
visible 3-tile dirt→stone trail, both bigger ponds render as clean
ring-with-island lakes with no clipping and (after the fix) no overlap
with path tiles, buildings, or other decorations.

**Round 5, right after (same session)**: round 4's 3-tile-only paths
didn't actually work — with tiles spread across a long route the gaps
were enormous, and a real screenshot from the user showed it reading as
scattered decoration again ("it doesn't connect AT ALL"). This
overcorrected on round 3's feedback by removing the one thing
(the line) that guaranteed visible connectivity. Fix: **both** layers
together, not one or the other — the round 3 SVG `<line>` restored as a
clearly visible base layer (not subtle; visibility is the whole point
this time), with the round 4 road sprites on top, now 5 per connection
instead of 3 (`t = 0.15, 0.35, 0.5, 0.65, 0.85`) so real sprite art stays
the dominant visual. `PATH_TILES`/`layoutPoint`/`lerp`/
`TOWN_SQUARE_POINT` unchanged; only tile density and the re-added
`PATH_LINES` SVG layer. Lesson for next time a similar tension comes up
(a real-asset-art requirement vs. a must-read-as-connected requirement,
where the pack doesn't have straight segments): layer both, don't pick
one — verified live against the user's own screenshot of the broken
state before calling it fixed, not just against a differently-composed
screenshot.

### 2026-09-15 (third session) — World view polish: bigger buildings, checkerboard grass, terrain, growth-gated scatter houses and walls

Follow-up to the kingdom-growth session below, after the user tried the
real building art live. Two rounds of feedback: first "buildings should
be bigger, ground should be real pixel art instead of the placeholder
gradient" (small, landed first); then, after seeing that, "the flat green
is blinding — use the pack's actual grid/grass texture, add forests/
mountains/water/paths/crops, and make small houses + city walls appear as
the town grows," with a reference photo (a different, richer tileset,
used as a mood board) and — critically — exact Reference Sheet
coordinates from the user for grass/forest/mountain locations.

- **Round 1** (landed, then had to fix a bug it introduced): bumped
  `Building.tsx`'s `STAGE_SCALE` `[2,3,2]` → `[3,4,3]`; replaced
  `TownMap.tsx`'s `GROUND_STYLE` radial/linear-gradient placeholder with
  a tiled `grass` `TileSprite` grid. Two real bugs caught live before
  calling it done: the grid's fixed tile count (400) ran out partway
  across a large real screen, leaving visibly blank rows (fixed by
  bumping to a comfortably oversized 1800); and removing the root's own
  opaque background (it had been baked into the old gradient's `style`
  prop, not applied separately) let `LaptopFrame`'s hidden-but-
  `visibility:visible`-overridden OS content show through hairline gaps
  between tiles — fixed with an explicit opaque `backgroundColor`
  fallback on `TownMap`'s root (now documented in Architecture
  Decisions, since it's a real, non-obvious constraint for any future
  change to this ground layer).
- **Round 2** — verified the user's Reference Sheet coordinates
  pixel-by-pixel against the real `public/tiles/toen-medieval-
  strategy.png` before trusting them (no PIL/ImageMagick installed;
  `sips`'s crop-offset semantics turned out unreliable and cost real
  time before switching to a small hand-written PNG decoder reading raw
  pixels directly — now the documented approach in Architecture
  Decisions). Confirmed: grass row1 col1/2 are two solid shades (not one
  — this is literally what makes a "grid" when alternated), col3/4 are
  textured variants; forest is row1 col5-7 (3 clusters); mountains are
  row2 col4-6 (3 **separate single-cell** sprites, not the `colSpan:2`
  `boulder` entry a previous session had guessed and never actually
  used — replaced). Also checked rows 1-20 and 32-38 (an advisor review
  caught that a first pass had concluded "no straight/corner road
  segments exist" from only 2 rows) — confirmed genuinely true across
  the wider check: the pack only has junction-shaped road chunks.
  Confirmed 2 distinct farmland tiles at col7 rows 7-8.
  - `lib/spriteMap.ts`: added `grass_dark`, `grass_tufted_alt`,
    `tree_cluster_2`/`3`, `mountain_1`/`2`/`3` (replacing `boulder`),
    `road_dirt_bend`, `crop_field_green`/`crop_field_orange`.
  - `TownMap.tsx`'s ground rewritten from a single-sprite CSS-Grid tile
    to two layered passes of absolutely-positioned cells over a fixed
    60×30 grid (JS-computed row/col, not CSS `auto-fill` — needed for
    the checkerboard to actually alternate correctly regardless of the
    real container width) — full rationale now in Architecture
    Decisions.
  - New fixed (non-procedural, matching `BUILDING_LAYOUT`/`DECORATIONS`)
    arrays: `TERRAIN_DECORATIONS` (forest/mountain/farmland/water/
    road-hub placements), `SCATTER_HOUSES` (small houses revealed
    progressively as `totalTownGrowth(townState)` crosses fixed
    thresholds — reused existing state, no new prop/schema), and a
    `castle_wall` render gated on `townState.kingdomStage` being
    `"city"`/`"kingdom"` (the user's choice of unlock stage, via
    `AskUserQuestion`) — also reused existing, already milestone-gated
    state. `lib/townGrowth.ts` and the schema were untouched this
    session, exactly as scoped.
  - The old 🌲 emoji `DECORATIONS` entry was replaced by a real
    `tree_pine` sprite now that real forest art exists (an emoji tree
    next to real tree sprites would have read as inconsistent); 🪵/🪧
    stay emoji (no sprite equivalent found).

Verified: `tsc --noEmit` clean at every step. Live-verified in Chrome
against the real account: opened "View Kingdom" after each change,
confirmed the checkerboard + scattered tufts read as textured, all new
terrain sprites render as crisp real pixel art with no overlap on
buildings/UI, the wall renders as a real long wall run at the top edge
(current real account state: `kingdomStage: "kingdom"`, so unlocked), all
6 scatter-houses are visible (current real `totalTownGrowth` is well
past every threshold), and toggling back to the OS view is unaffected.
**Not separately verified this session**: watching a scatter-house or the
wall newly *appear* at the exact moment its threshold is crossed (the
real account was already past every threshold going in) — the gating
logic is a direct, simple comparison against already-tested state, not
new mechanism, so this is a low-risk gap, not a blocking one.

### 2026-09-15 (second session) — real kingdom growth system: task completion → building/town progression

Replaced the placeholder `PixelBlock` building art with real sprite
rendering and wired real growth logic tying task completion to visual
progression, per `gamificationSystem.md`. Full design in the approved
plan; key deviations from the original request, both explicit user
corrections during clarification: the streak mechanic is removed
entirely ("goes against the principles of the game" — both of the
request's own milestone examples, week-finish and streak-record, were
also rejected once streaks were off the table), and the kingdom-stage
milestone instead gates on every Nth completed task. Full design
rationale in Architecture Decisions ("Gamification / World layer").

- Sprite inventory done via direct visual inspection (not the reference
  legend alone) of the full 112x832px sheet: found 5 new building-stage
  sprites (`house_small_2win`, `house_cluster_red_sm`,
  `house_tower_manor`, `town_wood_fenced`, `town_fortress`) fully
  covering all 5 `BuildingKey` ladders at 3 real stages each — no
  decoration-compositing fallback needed for this MVP. Also fixed a
  latent bug in the existing `spriteMap.ts`: `road_stone_junction`
  pointed at `col:3,row:10`, still dirt-colored; the real stone-junction
  sprite is `col:5,row:10`.
- Removed `currentStreak`/`longestStreak`/`graceTokens`/`lastGoodDay`
  end-to-end (schema, types, API, UI badges) and added
  `TownState.kingdomStage` in their place — migration
  `20260915173636_remove_streak_add_kingdom_stage`, applied via
  `prisma migrate diff --script` + hand-placed migration file +
  `migrate deploy` (`migrate dev` refuses non-interactive environments,
  even with `--create-only`).
- **A serious bug was found and fixed mid-session, in two passes** (full
  technical account in Architecture Decisions' new "New bug class found
  2026-09-15" entry — read that before touching `awardXpForTask` again):
  live testing showed one task completion producing **2x currency/growth**
  (2 `PATCH /api/gamification` + 4 `PATCH /api/town-state` for a single
  click). This doubling traced to pre-existing code (the nested-setState-
  with-a-real-fetch-inside-it pattern in `awardXpForTask` predates this
  session — confirmed the doubling occurs on code this session never
  touched). First fix attempt (moving the `saveGamificationState`/
  `saveTownGrowth` calls out of the `setState` updater bodies, gating them
  behind a `let awarded` flag the updater was supposed to set) was based
  on a wrong assumption — that a functional `setState` updater runs
  synchronously at the call site — and instead made **every award
  silently a no-op**: `task-xp` still fired and returned a real reward,
  but the persisting PATCHes never ran, for several real completions
  during testing. Caught via direct `console.log` instrumentation showing
  the post-`setState` log printing *before* the updater's own log. Real
  fix: compute the dedup check and next state synchronously against
  `latestGamificationRef`/`latestTownStateRef` (not inside any updater),
  then push plain values to `setState` purely to trigger a re-render.
- Real-account cleanup: 10 disposable `ZZZ disposable test task N` custom
  tasks created across both debugging passes were deleted via
  `DELETE /api/custom-tasks/:id` (same endpoint the UI's own "Delete
  Task" button uses). The account's `currency`/`trainingGroundsGrowth`/
  `watchtowerGrowth`/`townSquareGrowth`/`totalXp`/completion count are
  **left inflated from the pre-fix doubling bug** (tasks 1-3) — disclosed
  to the user with exact before/after numbers; no reversion PATCH was run
  without asking first, per explicit instruction from an advisor review
  mid-session. If the user asks for a revert later, the pre-test-1
  baseline was `currency: 1540, trainingGroundsGrowth: 130,
  watchtowerGrowth: 30, townSquareGrowth: 306` (`libraryGrowth`/
  `workshopGrowth` were never touched by any test task, stayed at
  460/990 throughout).

Verified: `tsc --noEmit` clean. Live-verified in Chrome against the real
account, post-fix: exactly one `PATCH /api/gamification` + one `PATCH
/api/town-state` per completion (confirmed via a monkey-patched
`window.fetch` log), correct exact deltas for every field including the
on-time Watchtower bonus and the non-townSquare Town Square activity
bonus, and a real milestone checkpoint firing correctly — the 80th
completion jumped `kingdomStage` directly from `village` to `kingdom` in
one shot (skipping `town`/`city`, since accumulated test growth already
qualified), matching the "never step through intermediate stages, never
regress" design. All 5 building stage ladders confirmed rendering real
sprite art (not `PixelBlock`) via the "View Kingdom" screen, including
per-building stage independence (Watchtower correctly still "Empty Plot"
at growth 55, below its 60 threshold, while the other 4 buildings showed
"Upgraded"). **Not done this session**: verifying `kingdomStage` at the
5th/10th/15th-completion checkpoints specifically (the milestone-gating
math itself is unchanged/simple and was exercised once at completion 80,
not stepped through incrementally); light-theme kingdom-stage visuals.

### 2026-09-15 — tile-sprite rendering utility + named sprite map + CC-BY credits page

User downloaded Toen's Medieval Strategy Sprite Pack (`art/`, 16x16
tilesheet) for future town/kingdom art and asked for: (1) a utility to
slice tiles by grid coordinate and render them, (2) a named coordinate
config so town-growth logic can reference sprites by name instead of raw
offsets, (3) a CC-BY credits page (a license requirement, not optional).

- Verified the actual source files first rather than trusting filenames:
  cropped the raw 112x832px tilesheet with a small hand-written
  zlib/struct PNG decoder (no PIL/ImageMagick installed) to confirm exact
  cell contents against `Reference Sheet.png`'s row/column legend, and
  found rows 46-52 are a baked-in CC-BY badge + attribution text block,
  not sprites (see Architecture Decisions) — the original "308 sprites"
  in the request undercounts the raw 7x52=364-cell sheet; likely the
  requester was going by the reference sheet's ~44 labeled content rows.
- Built `lib/spriteSheet.ts` (pure rect math, `SpriteCoord` with optional
  `colSpan`/`rowSpan`), `lib/spriteMap.ts` (named `SPRITE_COORDS`, keyed
  `${BuildingKey}_stage${0|1|2}` for growth buildings to match
  `computeBuildingStage()`'s existing 0|1|2 output), and
  `components/world/TileSprite.tsx` (CSS background-position, not
  canvas — matches how `Building.tsx`/`PixelBlock.tsx` already render
  positioned divs; `imageRendering: pixelated`, integer `scale` only).
  Copied the tilesheet + original license .txt into `public/tiles/`
  (files inside `public/` are referenced by URL path, not statically
  imported — confirmed against the bundled Next 16 image doc before
  wiring `TileSprite`, since an `@/public/...` static import isn't the
  documented pattern for this Next version).
- Real bugs caught by live visual verification, not assumed correct from
  the reference sheet alone: a temporary `/dev/sprite-check` page (never
  committed) rendered every `SPRITE_COORDS` entry at scale 6 in Chrome.
  First pass showed `tree_pine`/`house_small`/`house_red_roof`'s guessed
  `rowSpan: 2` each pulling in an unrelated *second* sprite from the row
  below (this pack's independent sprites sit directly adjacent with no
  buffer row, unlike the taller-than-one-cell sprites like towers/castle
  walls where a span is actually correct); fixed to 1x1. `town_walled`'s
  guessed `colSpan: 4` bled a second town's edge into the crop; narrowed
  to `colSpan: 2` and re-verified clean. `castle_tower`'s `rowSpan: 2`
  also overlapped `castle_wall`'s own cells; dropped to 1x1.
- New `app/credits/page.tsx` (creator name, source link, **and** a direct
  link to the CC-BY 4.0 license text, **and** a changes-made note — the
  user's own proposed credit wording was missing the latter two, which
  the pack's actual license file requires); linked from the Taskbar's ⚙️
  settings popover (not a page-body footer — the Taskbar is `sticky
  bottom-0` on every page and would visually collide with one).
  `gamificationSystem.md`'s art spec section amended (was: 32x32 base
  tile, Kenney CC0 recommended specifically to avoid attribution — both
  now wrong/stale) to reflect the real 16x16-at-2x/CC-BY choice.

Verified: tsc/lint clean in every touched file (pre-existing baseline
errors elsewhere untouched). Live-verified in Chrome: all 14
`SPRITE_COORDS` entries screenshotted and visually confirmed against
their intended sprite after the span/bleed fixes above; scratch page
deleted afterward. **Not done this session** (explicitly out of scope,
see Active TODOs): wiring `SPRITE_COORDS` into `Building.tsx`/replacing
`PixelBlock` — that's a separate art-direction pass since 4 of 5
`BuildingKey`s have no stage ladder yet and the pack has no literal
library/workshop/watchtower/townSquare sprite to point at.

### 2026-09-14 (third session) — fix Canvas task due-date edits reverting on reload

User reported: editing a Canvas-imported task's due date appeared to save,
but reverted to the original Canvas due date after a page reload.

Root cause (full account in Architecture Decisions, "Task customization /
persistence"): `resolveDueTime` returns `dueAt: null` whenever the due-time
field is in "End of day"/auto mode, discarding the newly-picked due
*date*; `handleSaveTask`'s override-diff logic then compared only the raw
`dueAt` instant, so a date change made in auto mode was silently dropped
instead of persisted as `dueAtOverride` — a very plausible flow, since a
user editing a Canvas assignment's odd default time (e.g. clicking "End of
day" to reset it) before picking a new date hits this on every save.
Diagnosed via a dedicated Explore agent tracing the full write/read/sync
path end-to-end, then a Plan agent to weigh a schema change (a separate
date-only override column) against a smaller diff-logic fix — went with
the smaller fix (new `endOfDayInstant()` in `lib/utils.ts`; `handleSaveTask`
now diffs by effective date, not raw instant, when `dueAt` is null) since
it fully resolves the bug without a migration or touching the
`resolveDueTime` helper shared with `AddTaskModal.tsx`.

Verified: `tsc --noEmit` clean, lint unchanged at the 19-problem baseline
(none in touched files), build clean. Live-verified in Chrome against the
real account: opened a real Biology assignment (Canvas due 09/16 11:59 PM),
clicked "End of day," changed the date to 09/22, saved, reloaded the page
— confirmed the task now renders on 09/22 (the exact previously-broken
path). Reverted the test edit back to the original 09/16 11:59 PM
afterward and confirmed via another reload that the card returned to its
original position.

### 2026-09-14 (second session) — announcement review clarity: louder evidence highlight, auto-scroll, inline name/course/type editing

User feedback: the evidence highlight was too subtle to notice, nothing
scrolled to it, and a wrong AI guess could only be fixed *after* accepting
by finding the task on the grid and reopening `EditTaskModal`.

- `AIReviewCard.tsx`: evidence `<mark>` switched from a 14-16%-opacity
  `--accent-soft` tint to a solid `--accent` background + bold white text;
  a `markRef` + `useEffect` keyed on `task.suggestionKey` now
  `scrollIntoView({behavior:"smooth", block:"center"})`s it inside the
  existing `max-h-80 overflow-y-auto` announcement panel whenever a new
  suggestion is shown. No changes to `lib/evidenceHighlight.ts`'s matching
  logic — presentation only.
- Same file: the dead-end "✏️ Edit" button (previously just a
  `console.log` stub in `AIReviewPanel.tsx`) is now a real inline
  edit toggle following `EditTaskModal`'s `editingClassification` pattern —
  swaps read-only name/course/type for a text input, a reused
  `CourseSelect`, and a type `<select>` (same Auto/HW/R/EXAM/TODO options).
  `AIReviewCard`/`AIReviewPanel` gained `courses`/`onCourseCreated` props,
  threaded from `WeeklyPlannerView`'s existing `courses` state and
  `handleCourseCreated`. `ProposedTask` (`types/proposedTask.ts`) gained an
  optional client-only `typeOverride` field (the AI pipeline never sets
  it) mirroring `Assignment["typeOverride"]`.
- **Real pre-existing bug found and fixed along the way**:
  `WeeklyPlannerView.handleSaveTask` unconditionally forced
  `typeOverride` to `""` for any custom/AI-accepted task
  (`isCustomTask ? "" : ...`), silently discarding any type chosen in
  `EditTaskModal` — unlike name/course/due, `CustomTask` has no column of
  its own to hold a type, so the "custom tasks store it directly, no
  override needed" reasoning that's correct for those three fields never
  applied to type; `TaskCustomization.typeOverride` was always its only
  storage, and the read-side merge (`effectiveTasks`) already applied it
  uniformly regardless of task origin. Fixed by dropping the `isCustomTask`
  gate for this one field. New suggestions with an edited type also get a
  `persistCustomization` write right after their `CustomTask` POST in
  `handleAIPlannerTask`, reusing the exact same mechanism — no schema
  change anywhere in this session.

Verified: `tsc --noEmit` clean, lint unchanged at the 19-problem baseline
(none in touched files), build clean. Live-verified end-to-end in Chrome
against the real account, **using local Ollama** (temporarily commented
out `ANTHROPIC_API_KEY` in `.env` with permission, restarted the dev
server, restored it and restarted again afterward — per user request, to
avoid Claude-Haiku token spend while testing): ran a real 28-announcement
analysis (`qwen2.5:3b-instruct`, ~2.3 min for the full streamed batch run,
one batch degraded on invalid JSON as designed, rest succeeded), confirmed
the highlight is now clearly visible and the panel auto-scrolls to it,
edited a suggestion's name/type inline and watched the header update live,
accepted it and confirmed the edited name/type landed on the grid card
immediately (`ENG - HW - W - ...`), then reopened it via `EditTaskModal`,
changed the type again, and confirmed that write round-tripped too
(`ENG - TODO - W - ...`) — directly exercising the `handleSaveTask` fix.
Deleted the disposable test task afterward.

### 2026-09-14 — gate "Up Next" against future custom start dates

User: a task shouldn't be prioritized (auto-selected as Up Next/the frog)
if its custom start date hasn't arrived yet, since the user literally
can't start it. Opposite/complementary case to the 2026-09-13 session
below (which handles an *expired* start date auto-reverting to auto) —
that session left a *future* start date passing through unaffected.

Design settled via an advisor/Plan-agent pass: threaded `today` in
explicitly as a new optional `PriorityInput` field rather than importing
`getTodayString` into `lib/prioritization.ts`, to match
`hasCustomStartDatePassed`'s "pass today in, don't self-read"
convention; gated the final `score` to `0` rather than `urgencyScore`
(avoids corrupting a reported field); added an overdue-beats-stale-start
guard the initial design missed (caught before implementing — see
Architecture Decisions for the scenario); hard-excludes in `upNext`'s
loop rather than relying on score-suppression alone. Full rationale in
Architecture Decisions ("Priority / scheduling") and
`prioritizationModule.md`'s new "Start-date gate" section.

Verified: tsc/lint (19-problem baseline, unchanged)/build clean; added 3
deterministic cases to `lib/prioritization.test.ts` (gated, ungated-once-
arrived, overdue-beats-stale-start) — all matched expected output.
Live-verified in Chrome against the real account: set the current Up
Next task's start date to tomorrow via `EditTaskModal`, confirmed a
different task (same due-date urgency bucket) became Up Next instead,
confirmed the future-started task still rendered normally in the grid
(shifted to start on its new date, per the pre-existing `resolveStartAt`
grid behavior) just not auto-selected, then reset it back to Auto and
confirmed it became Up Next again.

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
