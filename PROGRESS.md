# Progress log

Read this before starting work in this repo; update it before ending a
session. Keep entries short — this is a scratchpad for continuity, not
documentation (that's what `CLAUDE.md` and code comments are for).

## Architecture decisions

- **AI scoring runs against a local Ollama server**, not a hosted API. All
  4 call sites (`lib/analyzeAssignment.ts`, `lib/ai/analyzeAnnouncement.ts`,
  `lib/ai/findDuplicateTask.ts`, `app/api/task-xp/route.ts`) share one
  model, URL, and context size via
  `lib/ollamaConfig.ts`'s `OLLAMA_CHAT_URL`/`OLLAMA_MODEL`/`OLLAMA_NUM_CTX`
  (`OLLAMA_NUM_CTX=8192` added 2026-09-06 after a real production
  failure — see that session's log entry — nothing set this before, so
  every call silently relied on the pulled model's own default), all set
  `format: "json"` on the Ollama request (`qwen2.5:3b-instruct` — avoids
  Ollama swapping models in/out of GPU memory), and follow one pattern:
  `try/catch` → deterministic fallback, `AbortSignal.timeout(...)`, and
  batch multiple items into one call instead of one-per-item (see
  `lib/concurrency.ts`'s `mapWithConcurrency`/`chunk`). Batch-level
  failure handling: `analyzeAssignment.ts` still fails the whole batch on
  a malformed entry (its caller already retries per-item at a coarser
  grain, and always has a deterministic fallback score to fall back to —
  a softer failure mode than "nothing"); `analyzeAnnouncement.ts` and
  `lib/ai/findDuplicateTask.ts` both degrade **per entry** instead (fixed
  2026-09-06, having the exact same all-or-nothing bug — see that
  session's log). `task-xp` skips its
  Ollama call entirely whenever a deterministic `estimatedMinutes`-based
  XP value already covers it. Rich-text fields from Canvas (announcement
  messages, assignment descriptions) are HTML and MUST be run through
  `lib/htmlText.ts`'s `stripHtml`/`truncateText` before entering any
  prompt — unbounded HTML is exactly what caused the 2026-09-06 outage.
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
  the grid's own chronological (due date/time, then course) sort — see the
  2026-09-07 stacking-order entry below. `getTaskPriority` still drives the
  "tasks without a due date" section's order/labels, since a due-date sort
  is meaningless there. Focus task persists to localStorage
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
- **Gamification state (`GamificationState` Prisma model) is server-persisted,
  one row per user** — was plain `localStorage` (`lib/gamification.ts`),
  same convention as `taskState.ts`/`taskPlanning.ts` elsewhere, but
  moved to the DB ahead of `gamificationSystem.md`'s work since XP/town-
  progress needs to survive a shared browser or a Google-account switch,
  unlike the lower-stakes client caches it used to sit alongside.
  `getGamificationState`/`saveGamificationState` are now `async`,
  backed by `GET`/`PATCH /api/gamification`. `WeeklyPlannerView.tsx`'s
  gamification load lives in its own small effect (separate from the
  other, synchronous localStorage-hydration effect) since it's the only
  one of that group that's async; `awardXpForTask`'s
  `saveGamificationState(nextState)` call needed no change — already
  fire-and-forget inside a `setGamification` updater.
- **Card titles read `COURSE - TYPE - DAY - NAME`** (e.g. `MA - HW - F -
  Homework 2`), assembled by `lib/taskLabel.ts`'s `formatTaskLabel`,
  called from `WeeklyPlannerView.tsx`'s `AssignmentCard` render site.
  `courseAbbreviation`/`typeCode`/`dayCode` are all free, pure functions
  computed live on every render — never persisted, so editing a course's
  abbreviation or a task's due date updates the label instantly with no
  reprocessing. `typeCode` comes from `classifyLabelType`
  (`lib/taskLabel.ts`), which reuses the deterministic
  `classifyAssignmentType` keyword classifier (`lib/analyzeAssignment.ts`)
  — no LLM call anywhere in this label. Course abbreviations are a
  user-editable `CanvasCourse.abbreviation` column (sync never touches
  it), edited inline in `ManageCoursesModal.tsx`; unset falls back to
  `courseAbbreviationDefault`'s auto-derived initials. An earlier version
  of this label appended an AI-generated `shortTitle` segment in place of
  the raw name — built and iterated on across several 2026-09-06/07
  sessions, then fully removed 2026-09-09 in favor of just showing the
  task name (nothing of `lib/generateShortTitle.ts`,
  `app/api/task-short-titles`, or the related `EditTaskModal.tsx`
  regenerate UI remains in the codebase).
- **Course segment always shows the abbreviation now** — the earlier
  width-adaptive version (`AssignmentCard.tsx`'s root div as a `@container`,
  full course name via `@[200px]:inline`/abbreviation via `@[200px]:hidden`)
  was reverted 2026-09-06 per direct user feedback: they read the full-name
  cards as an inconsistency bug ("supposed to" always show the
  abbreviation), not a deliberate width-based feature, and its `200px`
  breakpoint had never actually been tuned against real card widths anyway
  (previously flagged as an unverified guess). `AssignmentCard.tsx` now
  renders `courseAbbreviation` unconditionally in the title; `@container`
  was removed from the wrapper since nothing else used it. The `label`
  prop is still split into `courseAbbreviation`/`typeCode`/`dayCode`/`name`
  (caller-assembled in `WeeklyPlannerView.tsx`'s render site) — no longer
  load-bearing for the course-variant choice, but kept since each piece
  still needs independent styling/logic in the card. Confirmed
  in the same pass: the course, type, and due-date segments were never
  Ollama-derived to begin with (`courseAbbreviationDefault`,
  `classifyLabelType`, `dayCode` are all pure functions) — the perceived
  inconsistency was purely this CSS breakpoint, not model variance.
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
  lookup) are gone — `formatTaskLabel` now takes the already-resolved
  `typeCode: LabelType` directly instead of an `AssignmentType` to look up.

- **Announcement analysis pipeline polish pass (2026-09-07)**: fixed four
  real problems in the announcement→suggestion→duplicate-check→review flow.
  (1) Raw Canvas HTML no longer leaks to the user as literal `<p>`/`<a>`
  tags — new `stripHtmlForDisplay` (`lib/htmlText.ts`, sibling to the
  existing prompt-only `stripHtml`, preserving paragraph/line breaks
  instead of collapsing them) applied at both raw-HTML render sites in
  `AIReviewCard.tsx` (the announcement message and the matched Canvas
  assignment's description). Also added evidence highlighting: a new
  `lib/evidenceHighlight.ts`'s `findEvidenceRange` does a case-insensitive
  exact-substring search for the AI's `evidence` text inside the cleaned
  announcement, and `AIReviewCard.tsx` wraps the match in a `<mark>` — no
  fuzzy matching; a paraphrased (non-verbatim) `evidence` value just
  doesn't highlight, since a wrong guess is worse than no highlight.
  (2) `lib/ai/analyzeAnnouncement.ts` now sets `temperature: 0` (matches
  `findDuplicateTask.ts`), uses `AbortSignal.timeout(...)` instead of a
  manual `AbortController` (same fix applied to `findDuplicateTask.ts` too,
  for consistency — both previously predated this repo's now-preferred
  idiom), adds a system message, and validates every extracted task's
  fields per-task (`toValidatedTask`) instead of an unchecked cast — a
  task with no usable `name` is dropped, invalid `confidence` defaults to
  `"low"`. New `lib/dueText.ts`'s `resolveDueTextToDate(dueText,
  referenceDate)` is a deterministic (no LLM, no new dependency) parser
  for the narrow `dueText` vocabulary the extraction prompt already
  constrains itself to (explicit dates, weekday names, "next `<weekday>`"
  — resolves the same as a bare weekday, i.e. closest upcoming — and
  "tomorrow"/"tonight"); anything outside that returns `null` rather than
  guessing. Resolved client-side in `AIReviewCard.tsx` (using the
  announcement's `postedAt` as the reference date and the browser's local
  clock), consistent with this repo's "no server-side timezone guessing"
  convention — `ProposedTask.due` itself is still always `null` from the
  server. (3) The actual cause of stale re-suggestion: there was no
  persisted accept/reject state anywhere, so a rejected suggestion
  reappeared identically on every future run as long as its announcement
  stayed inside the stateless date window. Fixed with a new
  `AnnouncementSuggestionReview` Prisma model (migration
  `20260907004906_add_announcement_suggestion_review`), keyed by a new
  content-derived `ProposedTask.suggestionKey` (`lib/suggestionKey.ts`:
  `sha256(sourceAnnouncementId + "::" + normalizedName)` — free-form id,
  no FK/cascade to `Announcement`, same precedent as
  `TaskCustomization`). `app/api/ai/analyze-announcements/route.ts` now
  batch-queries already-decided suggestion keys per announcement batch
  and filters them out **in automatic mode only** (custom mode = explicit
  re-selection, still shows them) — before the duplicate-check call too,
  so it's also a real Ollama-cost saving, not just a display filter. New
  `POST /api/ai/suggestion-review` route persists the decision;
  `AIReviewPanel.tsx`'s `handleAccept`/`handleReject` both call it
  fire-and-forget (a failed write just risks one stale resurfacing later,
  not a blocked review flow) — `handleReject` previously only
  `console.log`'d. Accepted tasks also now carry a `sourceAnnouncementId`
  (new optional field on `types/assignment.ts`'s `Assignment`) linking a
  planner task back to its source announcement. Deleted
  `lib/ai/selectRelevantAnnouncements.ts` — a fully-built relevance-scoring
  heuristic that was dead code (never wired into the route), superseded by
  the persisted-review-state fix rather than resurrected. Known accepted
  limitation: `suggestionKey` depends on `temperature: 0` making
  extraction reproducible for identical input — if a re-run of the same
  announcement produces a differently-worded task name for the same
  underlying work, its key changes and a previously-decided suggestion
  could resurface once; not solvable without a much more expensive
  stability pass, not worth chasing further. (4) Duplicate-check status
  couldn't distinguish "AI verified clean" from "check failed/degraded" —
  every degraded path (timeout, malformed entry, no nearby assignments)
  collapsed to the same `"none"` status as a genuine no-match, and the
  fallback `reason` text was gated behind `hasMatch` so it never rendered.
  `findDuplicateTask.ts`'s `DuplicateCheckResult` now carries
  `checkStatus: "checked" | "degraded"`; the route maps a degraded result
  (and its own whole-call-exception catch) to a new 4th
  `canvasMatch.status: "unavailable"` (widened union in
  `types/proposedTask.ts`); `AIReviewCard.tsx` renders that as a distinct
  grey "Duplicate check unavailable" box (not the green checkmark box)
  with the reason text now actually visible. Also fixed a latent bug this
  work exposed: `AIReviewCard`'s `dueDate` state never reset between
  suggestions (no `key` prop, so the same component instance persisted
  across `currentTask` changes) — harmless before since `due` was always
  `null`, but would have shown a stale pre-filled date once due-date
  resolution shipped. Fixed by keying `<AIReviewCard>` on
  `currentTask.suggestionKey` in `AIReviewPanel.tsx`.

- **Announcement extraction now runs on Claude Haiku (Anthropic API) instead
  of local Ollama, when `ANTHROPIC_API_KEY` is set** (2026-09-06, per direct
  user request after the structural Ollama fixes still weren't hitting a
  high enough success rate, plus explicit direction to bias the duplicate
  checker toward false positives in **code**, not just prompt wording). New
  `lib/anthropicConfig.ts` (model id + per-token price constants, mirrors
  `lib/ollamaConfig.ts`'s pattern). `lib/ai/analyzeAnnouncement.ts` now has
  two implementations: `analyzeAnnouncementsWithAnthropic` (primary, when the
  key is set) uses **forced tool use** (`tool_choice: {type:"tool",...}` +
  `strict:true`) so the SDK parses `tool_use.input` directly — no
  `JSON.parse()` step, no free-text JSON to get wrong — and
  `analyzeAnnouncementsWithOllama` (today's pre-existing implementation,
  unchanged except the join-key fix below), used when the key is unset. The
  exported `analyzeAnnouncements` dispatches on
  `process.env.ANTHROPIC_API_KEY` read at call time, so removing the env var
  reverts to Ollama-only with no code change — deliberate, given the user's
  capped ($10) and explicitly cost-cautious API credit. The Anthropic client
  is constructed lazily (`getAnthropicClient()`), not at module load, since
  the SDK throws at construction if it can't resolve any credential and
  eager construction would break the Ollama-only fallback for anyone without
  the key. **The duplicate checker (`findDuplicateTask.ts`) deliberately
  stays on local Ollama** — it runs ~5x more often per review trip (once per
  announcement vs. once per batch of up to 5), its prompt is already tuned
  from a prior session, and it's a comparatively simpler classification —
  not worth the added per-call Anthropic cost. A batch-level Anthropic
  failure (network/5xx/429 — not JSON validity, which forced tool use
  already guarantees structurally) is retried once as N single-announcement
  calls before giving up on the whole batch, each degrading independently;
  cost is logged per call (`console.log`, `lib/anthropicConfig.ts`'s price
  constants × `response.usage`) so real spend against the $10 cap is
  visible without any persistent tracking.
- **Two real false-negative bugs fixed in `findDuplicateTask.ts`, not just
  prompt tuning** (2026-09-06): the "lean toward false positives" prompt
  wording from the 2026-09-06 pass was already in place, but two code paths
  silently discarded a genuine `isDuplicate: true` model verdict and
  reported "not a duplicate" instead — exactly the false-negative failure
  mode the bias was supposed to prevent. (1) `isDuplicate: true` with
  `matchingAssignmentId: null`, and (2) `isDuplicate: true` with an
  unresolvable/unknown assignment id, both used to degrade via
  `fallbackResult(...)` → `isDuplicate: false`. Both now return a new
  `uncertainDuplicateResult(reason)`: `isDuplicate: true, confidence: "low",
  matchingAssignmentId: null, checkStatus: "checked"` — `checkStatus` must
  be `"checked"` (a genuine verdict, just an unresolvable pointer), not
  `"degraded"`, since the route maps `checkStatus === "degraded"` to the
  grey "unavailable" UI state, which would have erased the very flag this
  exists to preserve. Mirror-image bug also fixed: `assignments.length ===
  0` (no nearby Canvas assignments to compare against at all) used to
  report `checkStatus: "degraded"` (renders as "check unavailable") even
  though that's actually a *verified* clean result, not a failure — new
  `verifiedNoDuplicateResult(reason)` reports it as `checkStatus: "checked",
  isDuplicate: false` instead. The DECISION/bias prompt text itself was
  deliberately left untouched (already tuned on prior explicit direction).
  Also added: a positional-index fallback in both `findDuplicateTask.ts` and
  `analyzeAnnouncement.ts` (if the model's 1-based `index` field is
  dropped/duplicated, fall back to the same array position before
  degrading that entry) via a new shared
  `toProposedTasksForAnnouncements` helper on the extraction side; and
  Ollama's `format: "json"` (free-form flag) upgraded to a real JSON Schema
  object in `findDuplicateTask.ts` (grammar-constrained decoding, stronger
  guarantee for the 3B model than the boolean flag) plus `done_reason`/
  `eval_count` console logging to distinguish "hit num_predict and got
  truncated" from "finished normally but still malformed" — previously
  indistinguishable from the caller's side. `components/AIReviewCard.tsx`
  had a real rendering bug the two false-negative fixes above make
  reachable: `hasMatch` required a non-null `assignment`, so a flagged
  `"possible"`/`"definite"` result with `assignment: null` (now a real,
  reachable case) fell through to the "No Canvas duplicate detected"
  clean-state message **while the "Possible Duplicate" badge above it still
  showed** — a directly contradictory UI. Fixed by splitting "is flagged"
  from "has resolved assignment details to show"; a flagged result with no
  assignment now renders its own amber reasoning box instead.

- **Announcement analysis now has a user-visible, user-controllable time
  range with zero AI cost for the preview** (2026-09-06, same session as the
  Haiku migration above — user tested it live immediately after and had to
  abort because it was analyzing too many announcements at once). The
  default window (`ANNOUNCEMENT_BUFFER_DAYS = 5` in
  `app/api/ai/analyze-announcements/route.ts` — Wednesday of the previous
  week through Sunday of the current week) was **not** changed; it already
  matched the user's own stated heuristic ("most announcements come out by
  the Wednesday before"). The actual gaps were that this window was
  invisible (no count/preview before committing to the now-real-money Haiku
  call) and fixed (no way to widen it, and an already-built-but-never-wired
  "custom mode" `selectedAnnouncementIds` path sat unused). Fixed by adding
  a `dryRun: true` flag to the *existing* route (no new endpoint) that runs
  everything through fetching/filtering/sorting announcements and returns
  just `announcementCount`/`preview` (id/title/course/postedAt only — no
  `message`, deliberately, so a preview doesn't ship full announcement
  bodies) without ever calling `analyzeAnnouncements`/`findDuplicateTasks` —
  genuinely free. The route also now accepts optional `from`/`to`
  (`YYYY-MM-DD`) overriding the default window; parsed via `lib/utils.ts`'s
  `parseLocalDate` (not `new Date(str)`/`.toISOString()`, both UTC-based and
  would shift the boundary by the server's offset). `isInAutomaticAnnouncementWindow`
  was replaced by `resolveAnnouncementWindow(from, to)` (returns
  `{windowStart, windowEnd, isDefaultRange}`, falling back to the exact
  original Monday-based math when `from`/`to` are absent or malformed/
  inverted — no 400, since the only caller is this app's own UI and a bad
  value here is a defensive case, not a real input boundary) +
  `isWithinRange`; this also collapsed a pre-existing duplication where the
  route recomputed the same window a second time just for a log line.
  `components/AIReviewPanel.tsx` gained a small preset control (This week
  [default] / This week + last week / Last 30 days / Custom range,
  following `StartDateField.tsx`'s segmented-button pattern but using this
  panel's own `var(--accent)`/theme-token classes, not that component's
  hardcoded slate/dark ones) that auto-fires a debounced dry-run preview
  (immediate for preset clicks, ~400ms for the two custom `<input
  type="date">` fields, guarded against out-of-order responses from rapid
  switching via a request-sequence ref) and renders "Analyze N
  announcement(s)" as the button label — disabled only on a known-empty or
  invalid range (not while the preview is merely loading/failed, so a
  slow/failed preview doesn't strand the button permanently disabled — falls
  back to the plain "Review AI Suggestions" label and lets the real call
  proceed with the server's own default). A soft (non-blocking) amber note
  appears above 15 announcements suggesting a narrower range. The "This
  week" preset deliberately sends no `from`/`to` at all rather than
  reproducing the Monday-math client-side, so the server stays the single
  source of truth for the default and the two can't drift apart later.
  Everything below the button (`AIReviewCard` rendering, accept/reject,
  `saveSuggestionReview`, the finished/empty-state blocks) is untouched —
  only the request body `analyzeAnnouncements()` sends changed.

- **Real bug found and fixed via live testing (2026-09-06, same session):
  the automatic announcement window was anchored to the wrong "current
  week."** User reported 13 announcements when they expected ~6 (one per
  active class) and specifically pushed back on "the window is already
  correct" — right to. Used the Chrome extension to click through the live
  app and read the actual dry-run network response
  (`fetch("/api/ai/analyze-announcements", {method:"POST", body:
  JSON.stringify({dryRun:true})})` from the page's own console): confirmed
  `filtering.rangeStart/rangeEnd` were Wed Aug 26 → Sun Sep 6, while the
  planner's own header (same page, same load) showed "This week" as
  **Sep 6 – Sep 12**. Root cause: `analyze-announcements/route.ts`'s
  `getStartOfCurrentWeek()` used a **Monday-start** week
  (`day===0?6:day-1`), while `app/page.tsx` and `WeeklyPlannerView.tsx`'s
  `returnToCurrentWeek()` — the actual planner grid — both use a
  **Sunday-start** week (`date.getDate() - date.getDay()`), confirmed by
  grepping every `getDay()` call site in the repo. Today being a Sunday is
  the worst case for that mismatch: a Monday-start week containing "today"
  (Sunday) is the week that just *ended*, not the one the planner shows as
  current, so the entire 12-day window pointed at the wrong span — not "too
  many announcements," the wrong ones. Fixed by extracting one shared
  `getStartOfWeek(date?)` into `lib/utils.ts` (Sunday-start, the convention
  already used everywhere else) and pointing all three independent
  re-derivations at it: `app/page.tsx`, `WeeklyPlannerView.tsx`'s
  `returnToCurrentWeek()`, `analyze-announcements/route.ts`'s
  `resolveAnnouncementWindow`, and `AIReviewPanel.tsx`'s
  `"thisAndLastWeek"` preset math (which had copied the same wrong
  Monday-based logic in the previous session — my own mistake, now fixed
  too). `ANNOUNCEMENT_BUFFER_DAYS` changed from `5` to `4` — with a Sunday
  anchor, 4 days back lands on Wednesday, preserving the exact same
  "Wednesday of the prior week" landmark the buffer was always meant to
  express (`Sun − 4 = Wed`, same day as before, just correctly attached to
  the right Sunday). **Verified live, not just in theory**: re-ran the same
  dry-run fetch after the fix — `announcementCount` dropped from 13 to
  **exactly 6**, `filtering.rangeStart/rangeEnd` now read Wed Sep 2 → Sat
  Sep 12 (matching the planner's displayed week precisely), and grouping
  the response's `preview[]` by course showed **exactly one announcement
  per course, for all 6 active courses** — confirming both original
  suspicions (deleted-course leakage, an unscoped bulk Canvas pull) were
  correctly ruled out earlier, and that this week-start mismatch was the
  actual and complete explanation. Also verified: `npx tsc --noEmit`
  clean, `npm run lint` at the exact 19-problem baseline (0 new), `npm run
  build` clean, and an 11-check throwaway `npx tsx` script confirming the
  new window math for a Sunday, a mid-week Wednesday, and the Saturday
  boundary — not just the one Sunday case that exposed the bug.

- **Announcement pipeline cost/reliability fixes (2026-09-07)**: user reported
  real spend ($0.11 so far) higher than expected plus two live failures in one
  run (an Anthropic batch timeout cascading to expensive individual retries,
  and a local Ollama duplicate-check timeout). Investigated
  `announcementFix.md` (the user's own brainstorm doc) against the actual
  code: one of its 3 proposed fixes (hallucinated duplicate-check IDs) was
  already implemented from a prior session; prompt caching (its Issue 3) was
  checked against the `claude-api` skill's caching reference and rejected —
  Haiku 4.5's minimum cacheable prefix is 4,096 tokens, current system+tool
  content is only ~1,600-1,800 tokens, so a `cache_control` marker would
  silently no-op; reducing `ANNOUNCEMENT_BATCH_SIZE` (its Issue 1) was also
  rejected — fixed per-call overhead is the majority of every call's tokens,
  so smaller batches raise steady-state cost. Two real bugs it didn't mention
  were found instead: (1) `lib/ai/analyzeAnnouncement.ts`'s
  `callAnthropicForBatch` was sending the ~2,200-token `RULES` block **twice**
  per call (once as `system`, once again pasted into the user prompt) —
  removed the duplicate, the single biggest verified cost cut. (2)
  `app/api/ai/analyze-announcements/route.ts`'s duplicate-check step ran an
  unbounded `Promise.all` over every announcement in a batch (up to
  `ANNOUNCEMENT_BATCH_SIZE = 5`) *inside* each of up to `OLLAMA_CONCURRENCY =
  2` concurrently-running batch workers — up to 10 simultaneous local Ollama
  calls, fighting over the same compute and directly explaining the logged
  duplicate-check timeout; changed to `mapWithConcurrency(..., 1, ...)` so
  each batch worker's duplicate checks run one-at-a-time, capping total
  concurrent local Ollama calls at `OLLAMA_CONCURRENCY` system-wide (matching
  what that constant's name already implied). Also: `ANTHROPIC_TIMEOUT_MS`
  raised 20s → 45s (a real logged call produced 1,031 output tokens, plausibly
  exceeding 20s); the flat "retry as N individual calls" fallback in
  `analyzeAnnouncementsWithAnthropic` was replaced with recursive
  split-in-half bisection (retry the failed batch as two halves, recursing
  further on failure, bottoming out at single-announcement degrade-to-empty),
  per explicit user direction to keep more of the batching benefit on a
  partial failure. Separately, per explicit user direction to **keep** the
  duplicate-checker's existing false-positive bias (an unresolved match stays
  flagged as an uncertain duplicate rather than being cleared —
  `uncertainDuplicateResult`, unchanged) rather than adopt
  `announcementFix.md`'s Issue 2 (which would have reversed that), the actual
  cause of the "unknown assignment ID" cases was fixed instead:
  `lib/ai/findDuplicateTask.ts`'s duplicate-check schema/prompt now asks the
  local Ollama model for a 1-based `matchingAssignmentNumber` (matching the
  `ASSIGNMENT N` numbering already in the prompt) instead of retyping the
  ~25-character assignment id — comparing a logged bad id
  (`cmti0swc0082b8uxnr1v4yn`) against the real one
  (`cmti0sqw90007b8uu56fnff5b`) showed the 3B model was mangling characters
  while retyping, not inventing a fake assignment, so removing the retyping
  step removes the failure class; resolved to the real id server-side
  (`assignments[number - 1]`). The DECISION/bias prompt wording itself is
  untouched. Verified with `npx tsc --noEmit` (clean), `npm run lint` (exact
  pre-existing 19-problem baseline in unrelated files, 0 new — none of the 3
  touched files appear in the lint output), and `npm run build` (clean, all
  routes generated). **Not yet verified against a live Anthropic/Ollama run**
  — no API key/Ollama access this session — see Active TODOs.

- **Weekly grid stacking order is now chronological, not priority-bucketed
  (2026-09-07)**: user reported "weird" stacking, specifically that
  midday-due tasks weren't sorting above end-of-day ones. Root cause: the
  old `sortedTasks` comparator (`WeeklyPlannerView.tsx`) sorted by
  `getTaskPriority`'s day-bucketed + importance-bucketed rank, with a
  same-day tiebreak on `parseLocalDate(a.due)` that's a no-op whenever two
  tasks share a `due` date — `dueAt`/`dueFraction` (actual time-of-day)
  were never consulted, so same-day tasks landed in API order, not
  chronological order. New comparator: completion status, then `due` date
  string compare, then `dueFraction` (absent = end of day = `1`, same
  convention as `calculateGridSpan`), then course abbreviation
  (`localeCompare`, via a `courseAbbreviationByName` Map built once above
  the sort). Deliberately compares date-string and fraction as two separate
  keys rather than summing them into one millisecond value, to avoid a DST
  edge case `daysBetween`'s own comment already flags. The "tasks without a
  due date" section keeps its own separate priority-based sort (a
  due-date sort is meaningless once every task shares the same sentinel) —
  it would otherwise have silently become course-alphabetical while still
  showing `getTaskPriority` labels. Also changed the grid container's
  `grid-flow-row-dense` → `grid-flow-row` (`WeeklyPlannerView.tsx`): dense
  packing lets the browser backfill an earlier row's gap with a *later*
  array item whenever that item's column-span happens to fit there,
  actively fighting the new chronological sort for any week with
  multi-day bars. Verified live (Chrome extension, real logged-in data):
  same-day tasks now stack by time-of-day (e.g. a 2:00 PM task above three
  11:59 PM tasks, which then group alphabetically by course — CHI, COLL,
  SCI), and no-due-time tasks correctly sort after explicit end-of-day
  (11:59 PM) tasks on the same day (`dueFraction ?? 1` vs. an explicit
  ~0.999). No visually broken gaps observed from dropping `dense` on this
  data set.
- **Any task field is now user-overridable, not just `shortTitle`/`course`
  (2026-09-07)**: user asked to be able to correct any AI-guessed field,
  specifically the type badge (HW/R/EXAM/TODO) when `classifyLabelType`
  guesses wrong, plus noted that `name`/due-date edits on a Canvas-synced
  task were silently discarded (`EditTaskModal` accepted them,
  `handleSaveTask` updated in-memory state only — nothing persisted, and
  the next Canvas sync would've overwritten them anyway per
  `lib/canvasIngest.ts`). Extended the existing `TaskCustomization.course`
  override pattern with three new nullable columns —
  `nameOverride String?`, `typeOverride String?`, `dueAtOverride
  DateTime?` (migration `20260907211628_add_task_customization_overrides`)
  — following the exact same schema → PATCH validation → `effectiveTasks`
  merge → diff-on-save persistence chain already proven for `course`. Only
  Canvas-synced tasks use this table for these fields; custom (`custom-*`)
  tasks already store everything directly on their localStorage object.
  `name`/`dueAtOverride` use the same "only pin an override when this save
  actually changed the *effective* value" diffing `course` already used
  (so a notes-only save doesn't silently freeze them); `typeOverride` skips
  that heuristic since `EditTaskModal` now has an explicit "Auto (<code>)"
  option in a new "Task Type" `<select>`, so intent is unambiguous.
  `types/assignment.ts`'s `Assignment.typeOverride` is an inlined
  `"HW"|"R"|"EXAM"|"TODO"|null` union rather than an import of
  `lib/taskLabel.ts`'s `LabelType` — that file imports `Assignment` from
  here, so the reverse import would be circular. Verified live
  (Chrome extension, real logged-in data): changed a real task's type via
  the new dropdown, confirmed the Card Label preview updated live before
  saving, confirmed the card badge updated on save, and confirmed it
  survived a full page reload (real DB persistence, not just optimistic
  client state) before reverting the test edit back to Auto.

- **All remaining browser-local planner state moved to the database
  (2026-09-07, later the same day as the stacking-order/override work)**:
  user reported the planner open in two different Chrome browser profiles
  (same NextAuth account, different OS-level Google logins) wasn't sharing
  custom tasks or "custom class abbreviations." Root cause, confirmed by a
  full `localStorage`-key audit: `custom_tasks` (a custom task's entire
  identity — no DB row existed for one at all), `deleted_task_ids`
  (tombstones for both deleted custom tasks and hidden Canvas-synced
  tasks), `task_states` (completion), `task_planning_estimates` (AI
  importance/difficulty/time), and `procrastination_history` were all
  localStorage-only — `CanvasCourse.abbreviation` itself was already
  correctly DB-backed; the "abbreviation" symptom was really just that a
  custom task's free-text course has no `CanvasCourse` row unless
  explicitly added via Manage Courses, so the whole task+course pairing
  was invisible on the second browser. User chose (via AskUserQuestion) to
  fix all five in one pass rather than just the two directly reported.
  - **Schema**: extended `TaskCustomization` with `completed`/
    `completedAt`/`deleted` (applies to any task, custom or Canvas-synced —
    `deleted` only meaningful for a Canvas-synced task; a deleted custom
    task is a real row delete instead). New `CustomTask` model — `id` is
    **client-supplied**, not `@default(cuid())`, since dozens of call
    sites test `id.startsWith("custom-")`. New `TaskPlanningEstimate`
    (`@@unique([userId, taskId])`) and `ProcrastinationRecord` (one row
    per completion record, not per type — the existing 12-per-type rolling
    cap moved server-side, pruned on insert).
  - **Design decision — relational per-task, not a `GamificationState`-
    style single JSON blob per user**: with this user's actual two-
    windows-open setup, a whole-blob replace risks one browser's PATCH
    (built from its own stale snapshot) clobbering a change the other
    browser just made to a *different* task. Every new field is scoped
    per-task via `TaskCustomization`'s existing `@@unique([userId,
    taskId])`, so concurrent edits to different tasks from two browsers
    can never stomp each other.
  - **Merge-safety rule**: `persistCustomization`'s PATCH is a full-row
    replace, not a server-side merge — every caller must spread the
    current known customization before overriding its own field(s).
    `handleSaveTask`'s existing course/name/type/due override logic now
    also carries forward `completed`/`completedAt`/`deleted` from
    `current`, or every unrelated detail save would have silently
    un-completed/un-deleted the task.
  - **API**: `app/api/custom-tasks/route.ts` (GET list, POST create) +
    `app/api/custom-tasks/[taskId]/route.ts` (PATCH, DELETE — real row
    delete, no tombstone) follow the established auth → `findUnique`
    → userId-scope pattern; POST does an explicit ownership check
    (`existing.userId !== user.id` → 409) rather than a blind upsert-by-id,
    since `id` is client-supplied and globally unique, not scoped by user.
    `app/api/task-planning/route.ts` gained `auth()` + persistence (was
    pure unauthenticated compute) — `POST` still computes via Ollama and
    now also upserts into `TaskPlanningEstimate` before returning (same
    "compute-and-persist in one route" shape used elsewhere); new
    `GET` loads persisted estimates; new `PUT` stores **already-computed**
    estimates with no Ollama call (migration-only, see below). New
    `app/api/procrastination-history/route.ts` (GET flat list, POST insert
    + prune).
  - **`lib/taskState.ts` retired entirely** (deleted, along with
    `types/taskState.ts`) — completion/deletion are just two more fields
    on the already-loaded `taskCustomizations` state, so there's no new
    load path or race window beyond the one already accepted for the
    course/name/type/due overrides. `lib/taskPlanning.ts` and
    `lib/procrastinationHistory.ts` kept their exported function shapes
    (matching `lib/gamification.ts`'s established async-wrapper
    precedent) but are now `fetch`-backed instead of `localStorage`-backed;
    `getProcrastinationIndexHours` changed from an implicit-localStorage-
    read to a pure function taking the history explicitly, since the
    effect recomputing it can no longer call it synchronously in a loop.
    The estimation effect (`WeeklyPlannerView.tsx`) now gates on a new
    `taskPlanningLoaded` flag before running `selectTasksNeedingEstimates`
    — without it, every page load would briefly see an empty `taskPlanning`
    map and kick off a wasted Ollama recompute burst before the real
    persisted values arrived a moment later.
  - **One-time legacy-localStorage migration, one effect per key, each
    gated on its own "loaded" flag + a `useRef` guard so it runs exactly
    once and only clears the key on confirmed success** (left in place on
    any failure, to retry next load): `custom_tasks` (skip anything
    already DB-backed or in the local deleted-ids list — never let a stale
    local copy overwrite a newer DB row, the exact risk this user's setup
    creates), `deleted_task_ids` (Canvas-task ids only — a custom-task id
    needs no tombstone), `task_states`, `task_planning_estimates`, and
    `procrastination_history`. **Real production data was found in this
    exact browser during this session's own testing** — 106 completed-task
    records, 664 cached AI estimates, 10 procrastination-history types —
    making this migration not a theoretical nicety but the thing that
    stopped a real semester's worth of data from silently vanishing on
    upgrade. Two real bugs caught by testing against that real data, not
    synthetic fixtures: (1) a chunk of the 664 cached estimates predated
    the current `TaskPlanningEstimate` shape entirely (string
    `"low"/"medium"/"high"` `importance` instead of a 1-10 number, several
    fields missing outright) — the migration now filters to only
    current-shape entries client-side before sending (permanently
    unmigratable entries are dropped, not retried forever) and the new
    `PUT /api/task-planning` route degrades per-entry rather than
    rejecting the whole batch on one bad item, matching this repo's
    established per-entry-degradation philosophy elsewhere. (2) A
    `useEffect`-referenced `const` (`patchCustomizationAwaited`) declared
    later in the component than the effect that closed over it triggered a
    real lint error ("Cannot access variable before it is declared") even
    though the closure is runtime-safe (effects run post-render) — fixed
    by moving `persistCustomization`/`patchCustomizationAwaited` above
    every effect that references them, rather than suppressing the rule.
    Confirmed live (Chrome extension): after this session's testing, DB
    row counts showed 133 completed `TaskCustomization` rows, 91 deleted
    ones, 13 `CustomTask` rows, 423 `TaskPlanningEstimate` rows, and 41
    `ProcrastinationRecord` rows — higher than what this one browser's own
    localStorage held, consistent with the user's *other* real browser
    window (left open, same account, same dev server) independently
    running the same migration against its own separate localStorage and
    merging into the same shared DB — i.e., live evidence of the actual
    two-browser bug this session set out to fix, closing itself out in
    real time.
  - **Deliberately not migrated**: nothing — all five identified
    localStorage keys were migrated. `pomodoro_state`,
    `pomodoro_active_task_id`, `planner_theme`, `music-player-volume`
    stay `localStorage`-only on purpose (genuinely per-device: a running
    wall-clock timer, a UI preference — not account data).

- **Fixed a real grid-wide rendering regression from the browser-local-state
  migration above (2026-09-07, same day, immediately after)**: user reported
  every assignment card shifted right, misaligned from the day-divider lines
  — and correctly pinned it on the DB-migration session specifically, not
  the earlier stacking-order one. Diagnosed via live DOM inspection (not
  guessed): the background divider grid and foreground card grid had
  byte-identical container rects (ruling out a container-level offset), but
  `getComputedStyle(foregroundGrid).gridTemplateColumns` showed **9**
  tracks instead of 7 — two cards had a computed `grid-column` of literally
  `"NaN"` (invalid CSS, dropped by the browser, falls back to
  auto-placement, which forces the extra implicit tracks that shrink every
  other column and shift every card). Both `NaN` cards were completed
  tasks with no explicit Start Date override. Root cause:
  `WeeklyPlannerView.tsx`'s weekly-grid render passes
  `taskCustomization?.startAt || taskCustomization?.completedAt ||
  undefined` into `calculateGridSpan`, which parses it with
  `lib/utils.ts`'s `parseLocalDate` (expects plain `"YYYY-MM-DD"` —
  `dateString.split("-")`). `startAt` is correctly serialized that way
  (`.toISOString().slice(0, 10)`) in both `task-customizations` routes, but
  `completedAt` was serialized as a **full ISO instant**
  (`.toISOString()`, no `.slice(0, 10)`) — splitting
  `"2026-09-07T00:00:00.000Z"` on `"-"` yields `Number("07T00:00:00.000Z")
  = NaN`, propagating through every downstream `daysBetween`/column
  computation. Before this session, `completedAt` lived in
  `localStorage`-backed `TaskState`, always written via `getTodayString()`
  (already plain-date), so this exact mismatch never existed — introduced
  when `completedAt` moved to a DB `DateTime` column and got serialized
  inconsistently with its sibling `startAt` field. Fixed with a 2-line
  change (`.toISOString().slice(0, 10)` in both
  `app/api/task-customizations/route.ts` and
  `app/api/task-customizations/[taskId]/route.ts`'s response mapping) —
  deliberately left `app/api/procrastination-history/route.ts`'s
  `completedAt.toISOString()` untouched, a different field on
  `ProcrastinationRecord` that genuinely needs full timestamp precision.
  Verified live: `getComputedStyle` now reports exactly 7 matching tracks
  on both grids, no card has `gridColumn === "NaN"`, and cards visually
  align with the day dividers again.

- **Added a third task status, "In Progress", between not-started and
  completed (2026-09-08)** — user wanted to mark a task as started/paused
  without either leaving it untouched or marking it fully done. One new
  column, `TaskCustomization.inProgress Boolean @default(false)` (migration
  `20260908235700_add_task_customization_in_progress`) — deliberately no
  new timestamp (nothing downstream needs "when did I start it," and adding
  one to the `startAt || completedAt` fallback chain that feeds
  `calculateGridSpan` would reopen the exact date-serialization `NaN`-
  column bug documented above). The 3-way state is derived, not persisted:
  new `lib/taskStatus.ts`'s `getTaskStatus(completed, inProgress)` →
  `"not_started" | "in_progress" | "completed"` (completed wins on a stray
  `completed && inProgress` row) and `nextTaskStatus(status)` for the
  click-to-cycle control — chosen over a `status: String` enum column
  specifically to avoid rewriting every existing boolean `completed`
  comparator/filter across the app (sort tiers, `openTasks`,
  `activeFocusTask`, the legacy `task_states` migration) for ~1/15th the
  touch surface.
  - **Old checkbox → new circular tri-state control**: new
    `components/TaskStatusToggle.tsx` (click cycles not started → in
    progress → completed → not started; conic-gradient half-fill for in
    progress, solid green + checkmark for completed), replacing the
    checkbox at all four places completion was toggled: `AssignmentCard.tsx`
    (now a `forwardRef` so the card's root div can be measured for the
    reorder animation below), the monthly-view inline row, the "tasks
    without a due date" row, and the "eat this frog" panel (which also kept
    its explicit "Mark done" button for a direct one-click complete,
    alongside the new toggle for a direct one-click start).
  - **`handleToggleComplete` (a binary flip) replaced with
    `handleSetStatus(task, newStatus, estimatedMinutes)`** — an explicit
    setter, since a boolean flip doesn't generalize to 3 states. XP award +
    procrastination-history recording (previously inlined in the toggle
    handler) extracted into `awardCompletionSideEffects(task,
    estimatedMinutes)` so both the card control and `EditTaskModal`'s new
    Status dropdown trigger the same side effects on a genuine transition
    into `completed` — only `EditTaskModal.handleSaveTask`'s explicit
    Status `<select>` (mirrors the existing Task Type override pattern) can
    also reach "completed", so both paths needed to share this rather than
    one silently skipping XP.
  - **Completion animation, per explicit user request for something more
    satisfying than an instant re-sort**: a green pulse
    (`@keyframes task-complete-pulse` in `globals.css`, transform/opacity/
    background-color only) plays while a just-completed task's id sits in
    new `completingIds` state; the existing "completed sinks to the bottom"
    sort comparators (`sortedTasks`/`tasksWithoutDueDate`, unchanged in
    tier structure — no third tier was added for `in_progress`, only this
    hold mechanism) treat a `completingIds` member as not-yet-completed for
    placement during a `COMPLETION_HOLD_MS = 650`ms hold, so the card stays
    put while the pulse plays instead of jumping immediately. Once the hold
    timeout clears the id, the real sort takes over and the card's position
    changes — animated via a small custom FLIP-style hook,
    `useFlipReorder(orderedIds)` (one shared ref registry covering every
    currently-rendered card across all four render sites, since a task can
    only be mounted in one at a time): a `useLayoutEffect` measures
    `getBoundingClientRect()` before/after a reorder, applies the inverse
    delta as an instant `transform`, then transitions it to `translate(0)`
    over 320ms. Deliberately no new dependency (an animation library was
    considered and explicitly ruled out per CLAUDE.md's "never add a
    dependency speculatively," and this transform-only approach is already
    compositor-only — no per-frame layout/paint — which was the actual
    "lightweight, no lag" requirement, not something a library was needed
    for).
  - Verified: `npx tsc --noEmit` clean, `npm run lint` at 15 problems (down
    from a documented 19-problem baseline — the gap is unrelated deletions
    from a concurrent session, not a regression; the one warning this work
    did introduce, an unused `nextTaskStatus` import, was caught and
    removed), `npm run build` clean. **Live-verified against the real
    logged-in account** (Chrome extension): clicked a card's status toggle
    through the full not-started → in-progress → completed → not-started
    cycle and confirmed the aria-label/border styling/pulse class at each
    step via `getComputedStyle`; confirmed in-progress and completed status
    both survive a full page reload (real DB persistence — `GET
    /api/task-customizations` round-trip, not optimistic-only state);
    opened `EditTaskModal` and confirmed the new Status dropdown renders
    and pre-selects the task's current status. **A real side effect from
    this live testing was caught and precisely reverted**: completing 2
    real tasks + 1 more via the modal awarded real XP
    (`awardedTaskIds`/`totalXp` in `GamificationState`) and added one
    `ProcrastinationRecord` — the XP was exactly reversible (before/after
    `totalXp` and the 3 newly-added task ids were both known, so a
    corrective `PATCH /api/gamification` restored the exact prior state,
    360 XP / Level 4, confirmed via reload); the single stray
    `ProcrastinationRecord` (a reading-type completion) was **not** deleted
    — no delete endpoint exists for that table, and several other
    same-day records exist that may be the user's own genuine activity, so
    guessing which to remove risked destroying real data. Low-stakes
    either way (it only nudges one assignment type's procrastination-index
    average, nothing user-visible), left as a known, disclosed leftover
    rather than risking a wrong deletion.
  - Not yet exercised: the FLIP slide's actual smoothness/frame timing
    wasn't measurable through the browser-automation screenshot pipeline
    (a background/inactive automated tab throttles `setTimeout` to ~1/sec,
    which distorts any timing measurement taken that way) — confirmed the
    mechanism fires (pulse class present mid-hold, gone after) but not
    watched as continuous motion by a human. Worth a quick manual look next
    time there's an interactive session.
  - **Coordination note**: this session ran concurrently with another
    active session (`remove-short-title-feature`) editing the exact same
    files (`AssignmentCard.tsx`, `WeeklyPlannerView.tsx`, `schema.prisma`,
    `types/assignment.ts`) to remove the AI short-title feature. Paused all
    edits to those files (confirmed via `ListAgents` that the peer session
    was `busy`) until the user confirmed it had gone idle, then re-read
    every touched file fresh before resuming — no lost work on either
    side, but worth remembering this is a real, recurring hazard in this
    repo (same caution flagged in an earlier session's log entry above).

- **User-customizable course badge color (2026-09-09)**: `CanvasCourse.color`
  (nullable hex string) follows the exact same override pattern as
  `abbreviation` — sync never touches it, empty string on `PATCH` clears
  back to the auto-derived default. The auto-derived default itself
  (a deterministic name-hash → one of 8 Tailwind classes) moved out of
  `AssignmentCard.tsx` into `lib/courseColor.ts`'s `courseColorDefault` so
  `ManageCoursesModal.tsx`'s "no override yet" swatch preview can reuse the
  identical logic instead of guessing/duplicating it. A custom color is an
  arbitrary hex value (not one of the fixed Tailwind classes), so
  `AssignmentCard.tsx`'s badge applies it via inline `style.backgroundColor`
  when set, falling back to the Tailwind class otherwise. See the Session
  log entry for the full file list and live verification.

- **Weekly grid stacking reworked: explicit row placement, completion no
  longer moves a task, and completed cards shrink/dim (2026-09-09)** — two
  bugs reported against the just-shipped "In Progress" status work: a
  multi-day `startAt` bar landing mid-week made unrelated single-day tasks
  in other columns stair-step instead of stacking cleanly, and the new
  completion animation had a jarring jump (worst when completing the
  topmost card, but present to some degree for any completion). Two Explore
  investigations traced both to the same root cause: the grid had no
  explicit `gridRow` — CSS Grid's non-dense `grid-flow-row` auto-placement
  used one shared cursor for the whole week, so a wide item could strand
  later narrower items in the wrong row, and removing any array entry
  cascaded position changes across every column, worst for array position 0.
  - **`lib/utils.ts`**: `GridSpan` now also returns the raw `columnStart`/
    `columnEnd` CSS grid-line numbers `calculateGridSpan` already computed
    internally. New `packGridRows(items: {id, columnStart, columnEnd}[]):
    Map<string, number>` — a greedy per-column "next free row" cursor;
    an item's row is the max of its spanned columns' cursors, then bumps
    all of them to `row + 1`.
  - **`WeeklyPlannerView.tsx`**'s weekly-grid render is now two passes:
    compute `weekTaskLayouts` (task + `calculateGridSpan`) for
    `tasksForActiveWeek`, partition into `singleDayLayouts`/`barLayouts`,
    run `packGridRows` over `[...singleDayLayouts, ...barLayouts]` to get
    `weekTaskRows`, then render each `AssignmentCard` with both `gridSpan`
    and the new `gridRow` prop. Single-day tasks are always packed first
    (per explicit user direction, after live-testing showed a bar
    nestling into the "chronologically correct" gap still looked wrong) so
    a bar can never land above a single-day task sharing its column, only
    below one; **bars are packed by span length descending** — a longer
    bar (more runway, less urgent) claims the top rows, a shorter bar
    (closer due date, more urgent) sinks toward the bottom of the bar
    group. (This session tried `columnStart` ascending first, live-verified
    it fixed the immediate reported case, then the user asked for length-
    based ordering instead after seeing more of the grid — both are one-line
    changes to the same `bars.sort(...)` comparator.)
  - **Completing a task no longer moves it at all** — direct user
    request ("basically microsoft planner but flipped upside down") after
    live-testing showed even a *correct* slide-to-the-bottom animation felt
    bad. Removed `sortedTasks`/`tasksWithoutDueDate`'s `aCompleted !==
    bCompleted` tiebreak entirely — sort is now purely due date → time →
    course (or priority rank for no-due-date tasks), same as everything
    else; a completed task keeps its exact position, only its styling
    changes. This deleted essentially all of the hold/slide machinery from
    the previous session's work: `completingIds`'s "hold" role,
    `isEffectivelyCompleted`, the whole `useFlipReorder` FLIP-animation
    hook + `registerCardRef` wiring at all four render sites, and
    `COMPLETION_HOLD_MS`/`beginCompletionAnimation`. Replaced with a much
    simpler `pulsingIds` state + `triggerCompletionPulse(id)`: add the id,
    clear it after one `setTimeout(550ms)` — purely triggers the existing
    `task-complete-pulse` CSS flash, zero interaction with sort/layout.
    `AssignmentCard.tsx` reverted from `forwardRef` back to a plain
    function component (the `ref` it existed for is gone).
  - **Completed cards shrink and dim; active cards get better contrast**
    — direct user feedback after seeing the frozen-in-place completed
    tasks permanently take a full card's worth of space: "make them
    smaller, thinner, and lower their opacity... regular tasks [should]
    have a color that contrasts with the background better." In
    `AssignmentCard.tsx`: completed cards drop to `min-h-[24px]`, tighter
    padding, badge and detail-line dropped entirely (single truncated
    title line only), `opacity-55` (`hover:opacity-90`); active
    (non-completed, non-late, non-in-progress) cards' background moved
    from `bg-slate-900` (too close to the grid's own `bg-slate-900/30`
    divider layer) to `bg-slate-800` at full opacity. **Real bug caught
    live, not assumed**: a short completed card sharing a grid row with a
    tall active card in another column silently re-inflated to the full
    row height — CSS Grid items `align-items: stretch` by default, so
    `min-height` alone doesn't shrink a card unless it also opts out with
    `self-start`. Added `self-start` to the card's root div; verified via
    `getComputedStyle` before/after (`height: 68px` → `height: 24px` for
    the same completed card). Same shrink-when-completed treatment applied
    to the monthly-view's separate hand-rolled inline card in
    `WeeklyPlannerView.tsx`. Caveat, not fully solvable by this change
    alone: `packGridRows` tracks row *indices*, not pixel height, so a
    shared row's actual rendered height is still set by whichever column's
    occupant is tallest — the space savings vary week to week rather than
    being a fixed guaranteed amount.
  - **A concurrent-session hazard hit twice in this same session** (see
    the recurring caution elsewhere in this file): once with a session
    removing the short-title feature, once with a session adding the
    course-color feature above — both times paused all edits to the
    contested file (`AssignmentCard.tsx` both times) until `ListAgents`
    showed the peer session idle, then re-read fresh before continuing.
    One genuine false alarm this caused: `min-h-[24px]`/`opacity-55`
    appeared completely inert live (computed `height`/`opacity` didn't
    reflect them at all) immediately after editing — chased as a possible
    real bug (`align-items: stretch`, Tailwind arbitrary-value scanning)
    before noticing a peer session had started editing the same file 2
    minutes earlier; paused, and after it went idle the exact same
    `getComputedStyle` check showed the correct values with no further
    code change — the CSS had simply not finished regenerating yet under
    concurrent rapid saves. Worth remembering: an unexplained live-styling
    discrepancy right after an edit is worth an `ListAgents` check before
    assuming it's a real bug.
  - Verified: `npx tsc --noEmit` clean, `npm run lint` at the same 15-
    problem baseline (0 new) both before and after the peer session's
    course-color merge, `npm run build` clean. Live-verified via the
    Chrome extension against the real logged-in account's real data: a
    zero-cell-overlap invariant check across all 25 real weekly-grid cards
    (both before and after the bar-sort-direction change), the exact
    Self-Assessment/Friday-bars case from the user's screenshot confirmed
    reordered correctly by span length, and the completed/active card
    height+opacity values read back exactly as coded.

- **Weekly grid: bar ordering fixed to due-date ascending, and the "shared
  row height" gap bug fully rearchitected away (2026-09-09, later same
  session)** — live-testing the round above surfaced two more problems
  from a fresh screenshot: (1) bars were sorted by span length descending,
  which happened to look right when every bar's start defaulted to
  "today" but produced a chronologically nonsensical order (Wed → Fri →
  Thu) once bars had real varied start dates; (2) large, inconsistent gaps
  under completed cards — the caveat flagged in the entry above, now
  understood to be structural: CSS Grid rows are shared across all 7 day
  columns, so a row's rendered height is set by whichever column's item is
  tallest that row, and a 24px completed card sharing a row with a 71px
  active bar in another column was stranded in a 71px row. User explicitly
  chose the full rearchitecture over a cheaper "make completed cards even
  tinier" mitigation.
  - **Fix 1 (bar ordering)**: `WeeklyPlannerView.tsx`'s `barLayouts` sort
    comparator changed from span-length descending to
    `(a, b) => a.span.columnEnd - b.span.columnEnd` — due-date ascending.
    `columnEnd` is due-date-derived and unaffected by `startAt` in
    `calculateGridSpan`'s normal branch (this does NOT hold for the
    overdue branch, but overdue tasks are always single-day and never
    reach this comparator — noted in the code comment so a future change
    to that branch doesn't silently break the assumption).
  - **Fix 2 (gap rearchitecture)**: dropped CSS Grid's row mechanic for
    the weekly task layer entirely. `lib/utils.ts`: removed `packGridRows`
    and `GridSpan.gridColumn` (confirmed via repo-wide grep it was the
    only consumer); added `CARD_HEIGHT_PX` (`{completed: 28, active: 72}`),
    `CARD_GAP_PX` (12), and `packColumnOffsets` — same per-column-cursor
    algorithm as `packGridRows`, now tracking pixel Y-offsets from each
    item's actual fixed height instead of an abstract row index, and
    returning `{ offsets, totalHeight }` together so the container's
    rendered height and the packing math can never drift apart (a
    mismatch would silently clip the last card in the tallest column
    under `overflow-hidden`). `WeeklyPlannerView.tsx`'s weekly-grid task
    layer dropped `grid grid-cols-7 grid-flow-row` for a plain `relative`
    div with an inline `height: weekTaskLayerHeight` (from
    `packColumnOffsets`'s `totalHeight`); the decorative background
    divider layer needed no changes (`inset-0` already stretches to match
    whatever height the sibling ends up needing). `AssignmentCard.tsx`:
    replaced `gridSpan`/`gridRow` props with `columnStart`/`columnEnd`/
    `topPx`; root style is now `position: absolute` with fixed `h-[72px]`/
    `h-[28px]` (not `min-h`) instead of relying on content to size the
    card. **Alignment gotcha caught before shipping** (flagged by a design
    review before implementation): the divider layer is a real
    `grid grid-cols-7 gap-2`, so its column edges are NOT at `n/7 * 100%`
    — a flat percentage-based `left`/`width` would drift out of alignment
    with the dividers, worst at Fri/Sat. Fixed by computing `left`/`width`
    via `calc()` expressions that reproduce the divider grid's exact math
    (`calc((100% - 48px) / 7 * n + n * 8px)`, 48px = 6 gaps × 8px), and by
    folding the due-time `dueEndInsetPercent` inset directly into the
    width `calc()` as a multiplied scalar factor (`calc() ` allows
    multiplying a length by a plain number) rather than needing a separate
    wrapper element for it.
  - Verified: `npx tsc --noEmit`, `npm run lint` (same pre-existing
    baseline, 0 new), `npm run build` all clean. Live-verified against the
    real logged-in account's real current week (the exact Wed/Thu/Fri case
    from the user's screenshot): bars now stack Wed-due → Thu-due → Fri-due
    top-to-bottom; a pixel-level `getBoundingClientRect()` check found zero
    overlapping cards among the week's 25 real cards; every card's
    `left`/`right` matched its divider column's edges within ~0.15px
    across all 7 columns (including Fri/Sat, the highest-drift-risk
    columns); the tallest column's last card's `bottom` exactly equalled
    the container's rendered height (no drift, no clipping); consecutive
    completed cards in an uninterrupted column were spaced exactly 40px
    apart (28px card + 12px gap) with zero dead space. Completion flow
    re-verified end-to-end with a disposable custom test task (due Friday,
    defaulted to a 3-day Wed–Fri bar): shrank in place to the 28px
    completed style with no jump/reflow of other cards, confirming
    "completion never moves a task" still holds under the new absolute-
    position layout; confirmed `GET /api/gamification` showed the
    expected +20 XP/+1 awarded-task-id from the real completion POST, then
    reverted both via `PATCH /api/gamification` back to the exact
    pre-test baseline (460 XP / 20 awarded ids) before deleting the test
    task.

- **Weekly grid: `packColumnOffsets` rewritten as true skyline packing
  instead of a monotonic per-column cursor (2026-09-09, later same
  session)** — a fresh screenshot showed Thursday's column sitting almost
  empty while its bars rendered far down the page. Root cause, confirmed
  live via `getBoundingClientRect()`, not assumed: three *completed*
  bars due Wednesday (`CHI/HIS/MA - HW - W`) still carried a `startAt` of
  Tuesday from before this session's rework, so they span `[Tue, Wed]`.
  The old `packColumnOffsets` tracked one ever-growing number per column
  (`columnNextY`) — once those 3 bars inherited Tuesday's congestion (9
  stacked completed singles, cursor ~360px) and wrote that elevated value
  into column 3 too, every later bar sharing column 3 (the Thursday and
  Friday bars) inherited the same elevated floor even across a genuine
  156px→360px gap in column 3 that nothing actually occupied — a
  monotonic cursor can grow but never "remembers" a range it didn't truly
  use.
  - **First attempt, rejected by the user**: collapsing completed bars to
    single-day width at their due column (removing the cross-column
    coupling entirely) — implemented, live-verified working, then
    explicitly reverted: "the completed card spans should span the full
    width" — a completed bar's original multi-day width is real
    information (how many days it took) and must stay. Undone in full.
  - **Real fix**: `packColumnOffsets` now tracks a real list of occupied
    `[start, end]` pixel intervals per column (a skyline) instead of a
    single cursor, and finds the lowest `y` where a new item's height
    fits without overlapping any interval in *any* column it spans —
    merging overlapping padded ranges and scanning for the first gap,
    rather than always appending after the max.
  - **Reopened, and re-resolved, the ordering question from the earlier
    Fix 1 round**: true gap-filling can only find that Thursday-column
    gap by letting a bar render above an earlier-due bar in a shared
    column — which is exactly the non-monotonic-ordering complaint the
    user rejected a few rounds earlier. Rather than assume, asked
    directly via `AskUserQuestion`. Answer: **completed bars keep strict
    due-date order among themselves; active bars keep strict due-date
    order among themselves; between a completed bar and an active bar,
    ordering doesn't matter at all — fill gaps.** Implemented as a
    secondary per-`(status-group, column)` monotonic floor that only
    bars carry (`orderGroup: "completed-bar" | "active-bar"`, set in
    `WeeklyPlannerView.tsx` alongside the existing due-date sort) —
    checked/updated in addition to the skyline, so within either group a
    later-due bar can never render above an earlier one sharing a column,
    while the two groups interleave freely through the skyline alone.
    Single-day items get no `orderGroup` and need none: proved (not just
    assumed) that a bar's last occupied column is always exactly its due
    column, so any bar sharing a column with a single-day task is due
    on-or-after it — "bars sink below every single-day task" now falls
    out of due-date ordering structurally, for any dataset, rather than
    being a separate rule.
  - Deliberately **not** claiming this maximizes space usage — it's
    greedy first-fit and still leaves two small unreachable gaps in
    Thursday's own column (anything that could fill them also touches
    Wednesday, which is genuinely busy there). The honest, verified claim:
    the task layer's total height dropped from 888px to exactly 720px,
    and the Thursday bars rose from top 480/564 to 168/252 — predicted by
    hand-tracing the algorithm *before* implementing, then confirmed
    against the live DOM to the pixel, along with an explicit
    same-status-group ordering-invariant assertion (zero violations) and
    the existing zero-overlap invariant (also zero).

## Active TODOs (as of 2026-09-09)

- **Not a bug, don't "fix" again**: after the skyline-packing rework
  (see Architecture Decisions), Thursday's own column still shows two
  small unfilled gaps in today's real data. This is expected — the packer
  is greedy first-fit, not maximum-density, and every item that could
  fill those specific gaps also touches Wednesday's column, which is
  genuinely busy there. Confirmed correct via a hand-traced, `advisor`-
  reviewed prediction table before implementing, not an oversight to chase.
- ~~The FLIP-reorder slide's real-world smoothness hasn't been watched by
  a human yet~~ — **moot as of 2026-09-09**: `useFlipReorder` was deleted
  entirely that session (completing a task no longer moves it at all).
- ~~New, from tonight's grid-stacking rework (2026-09-09): ... savings vary
  row-to-row, since a shared row's height still follows its tallest
  occupant~~ — **resolved later the same session**: the Fix 2
  rearchitecture entry above replaced CSS Grid rows with independent
  per-column pixel offsets specifically to eliminate this — verified live
  as an exact, guaranteed 40px gap between stacked completed cards
  regardless of what's tallest in another column.
- Still worth watching: whether `opacity-55` reads as too dim/too visible
  on the light theme ("Cozy Tavern") — every pass so far only had the dark
  theme active to check against. One disclosed, low-stakes leftover from
  an earlier session's live-testing: a single stray `ProcrastinationRecord`
  (reading-type, completed that day) was not cleaned up — see that entry
  for why.
- **New, from tonight's browser-local-state migration**: `custom_tasks`,
  `deleted_task_ids`, and `task_states` migrations were verified against
  real production data in this session's own browser (see the Architecture
  Decisions entry above) and confirmed live end-to-end. **Not yet clicked
  through directly**: creating a brand-new custom task and confirming it
  appears in a genuinely separate second browser profile without a manual
  refresh trick (this session only had one controllable browser instance —
  the cross-browser confirmation came from indirect DB row-count evidence,
  not a side-by-side click-through); editing a custom task's due date/name
  and confirming the edit round-trips through `PATCH /api/custom-tasks`;
  deleting a Canvas-synced task and confirming a subsequent real Canvas
  sync doesn't resurrect it. Also worth a quick pass confirming the
  `task_planning_estimates` migration's per-entry filtering doesn't
  silently drop *valid* current-shape estimates by mistake — only checked
  against the one malformed sample this session happened to inspect, not
  all 664.
- **New, from tonight's stacking-order/override work**: only the
  `typeOverride` path was clicked through live end-to-end (set via
  dropdown → saved → reloaded → confirmed persisted). The `nameOverride`
  and `dueAtOverride` paths for a Canvas-synced task were verified only via
  `tsc`/lint/build, not by actually editing a real task's name or due
  date/time and confirming persistence across reload, or confirming a
  subsequent Canvas re-sync doesn't clobber them. Worth a follow-up pass:
  edit a Canvas-synced task's name and due date/time, reload, confirm both
  hold; then trigger a real "🔄 Sync Canvas" and confirm the overrides
  survive it. Also worth clicking through a week with more multi-day
  bars/overlapping due times than this session's data had, to double-check
  `grid-flow-row` (no longer `dense`) doesn't leave notably worse gaps on a
  busier week.
- **New, from tonight's announcement-pipeline cost/reliability fixes**: none
  of the changes above (RULES dedup, longer Anthropic timeout, bisection
  retry, Ollama duplicate-check concurrency cap, number-based assignment
  matching) have been exercised against a live Anthropic call or a running
  Ollama server this session. Worth re-running the same kind of batch that
  previously cost $0.11 and confirming: per-call `💰 Anthropic announcement
  extraction` cost lines drop roughly a third for the same batch size; a
  genuine batch failure now retries as two half-sized batches (visible in the
  log) rather than N singles; no `Duplicate check failed ... TimeoutError`
  under the same concurrent load that produced one before; and the
  `⚠️ ... returned an out-of-range assignment number` warning is now rare
  (it replaces the old "unknown assignment ID" warning, but should fire far
  less often since the model copies a small visible integer instead of
  retyping an opaque id).

- **Still open from the prior time-range work**: preset switching without a
  full reload/visible race, the custom-range date pickers, and the >15
  soft-warning rendering haven't been separately clicked through (the live
  session this turn focused on confirming the week-start fix specifically,
  via the dry-run JSON response rather than the full UI). Worth a quick
  pass next time there's browser access, though low-risk — the underlying
  data (`announcementCount`, `filtering`) is now confirmed correct, so this
  is purely about the preset UI's own behavior.
- ~~BLOCKING: ANTHROPIC_API_KEY invalid~~ — **resolved 2026-09-06, same
  session.** User regenerated the key in the Anthropic Console; re-verified
  with a fresh raw `https` request (200, real completion back) and then the
  full harness. **Everything in this pipeline is now verified end-to-end
  with a live key**, not just via mocked/error-path tests:
  - 4/4 deterministic `findDuplicateTask.ts` bug-fix tests still pass.
  - 1 live Ollama duplicate-check call: `done_reason: "stop"` (no
    truncation), schema-constrained JSON parsed cleanly, correctly flagged
    both real duplicates (including the "proposed task is part of a larger
    Canvas assignment" case) and correctly left a genuinely unrelated task
    alone.
  - **3/3 live Claude Haiku extraction calls succeeded with zero errors and
    zero bisection fallback triggered** (previously 0/3 due to the bad
    key). Quality was consistently good across all 3 runs against the same
    4-fixture set (Chinese-language, table-based, no-work, and multi-task
    announcements): correct zero-task result for the pure-reminder
    announcement every time; `dueText` preserved verbatim including the
    Chinese-wording case (`下周三`); and — notably better than the Ollama
    fallback's earlier test run — **correctly split multi-part assignments
    into separate tasks** per RULES section 4 (e.g. "read chapters 2-3 AND
    complete the response questions" → 2 tasks, not 1 merged task, matching
    the worked example already in the prompt). Cost: ~2305 input / ~325-364
    output tokens per full 4-announcement batch call, **~$0.004/call**
    (well in line with the pre-implementation estimate) — a full automatic
    review run at this size costs well under a cent; the $10 credit covers
    on the order of thousands of runs at this scale.
  - This TODO is now fully closed; nothing about the announcement-analysis
    pipeline fix remains unverified from this session's side. Real-world
    judgment on Haiku's output against the user's actual messy Canvas
    announcements (as opposed to this session's synthetic fixtures) is the
    only thing left to see — normal "try it for real" territory, not a
    known gap.
- **New, from tonight's "restore a deleted course" work — needs real-world
  verification**: no login/Canvas/extension-reload access this session, so
  `LIST_CANVAS_COURSES`/`RESTORE_COURSE` were only verified via `node --check`
  syntax validation, plus `tsc`/lint/build for the server side. Worth a full
  manual pass once available: reload the unpacked extension, confirm
  "Find Canvas Courses" lists both active and concluded courses, delete a
  course in the web app then restore it from the popup, and confirm a normal
  "🔄 Sync Canvas" still behaves identically post-refactor (real regression
  risk — it now goes through the extracted `lib/canvasIngest.ts` helpers
  instead of its own inlined logic).
- **Known, unrelated limitation surfaced while building the above** (not
  fixed — changes existing pruning semantics, needs its own review): a
  **hidden** course is just as vulnerable as a deleted one to disappearing
  for good — `app/api/canvas/sync/route.ts`'s pruning step deletes any
  `CanvasCourse` missing from the latest active-course payload regardless of
  its `hidden` flag, so a hidden course that later concludes in Canvas gets
  hard-deleted on the next sync, not just filtered from the planner.

- **The announcement-analysis polish pass above (HTML display, evidence
  highlighting, due-date resolution, persisted accept/reject state,
  duplicate-check "unavailable" status) has not been tested against a live
  Ollama server or a logged-in browser session** — no login/Ollama access
  this session. Worth a full manual pass once available: confirm
  announcement text and Canvas assignment descriptions render as readable
  text (not raw tags); confirm evidence highlighting lands on the right
  phrase for real announcements (and gracefully skips highlighting when
  `evidence` is a paraphrase rather than verbatim); confirm a `dueText`
  value pre-fills the due-date picker; reject a suggestion, re-run
  analysis, confirm it doesn't reappear (same for accept); stop Ollama and
  confirm the duplicate-check "unavailable" state renders distinctly from
  a genuine no-match. `lib/dueText.ts` was spot-checked standalone via
  `npx tsx` against synthetic inputs (weekday, "next `<weekday>`", explicit
  date incl. year-rollover, "tomorrow", unparseable text) and all resolved
  correctly, but hasn't seen real Ollama-extracted `dueText` values yet.
- **New, from tonight's announcement-analysis fix — needs real-world
  verification**: the message-length cap (1200 chars), per-entry
  degradation, `num_ctx=8192`, and 35s timeout were all sized from
  reasoning about the failure, not from re-running against the actual
  Canvas courses that failed (no login this session). Worth confirming
  with the user's real data that batches now complete cleanly. Also
  worth watching whether the duplicate-detection false-positive bias
  swings too far the other way in practice (flagging genuinely unrelated
  tasks) — the prompt change was deliberately aggressive per explicit
  direction, so some over-flagging is expected/accepted, but "clearly
  different work" examples in the prompt should still hold the line on
  obviously wrong matches.
- **New, from tonight's loading-indicator sweep**: every spinner/progress
  bar addition was verified only via `tsc`/build, not by actually
  clicking through the app (no browser session). Worth a manual pass:
  confirm each spinner appears during its wait and clears on both
  success and failure paths, especially `MusicPlayer.tsx`'s new
  `busyItemId` state (shared across 4 different actions — rename/delete
  playlist/track — so a bug there could show the wrong row as busy).
- Most of this session's UI/theming work (see log below) has **not been
  clicked through in a real browser** — no Claude-in-Chrome access. Worth
  a full manual pass, especially: the extension popup's live theme sync,
  Music Player at real laptop widths, and the new due-time picker.
- **New, from the 2026-09-06 cleanup pass — needs real-world verification:**
  the `findDuplicateTasks` "occasionally misses an obvious duplicate" issue
  was previously blamed on inherent 3B-model judgment variance; the actual
  root cause (one malformed entry throwing and blanking every task in that
  announcement) is now fixed (per-item fallback instead), but this hasn't
  been re-tested against real announcements yet — worth confirming the
  false-negative rate actually drops, in case there's a second contributing
  cause. Same pass added `format: "json"` to 4 Ollama call sites that
  didn't have it and consolidated `OLLAMA_URL`/model handling into
  `lib/ollamaConfig.ts` (previously inconsistent across 5 files) —
  neither re-tested against a live Ollama server this session.
- Canvas sync reconciliation only prunes courses, not individual
  assignments/discussions/announcements within a still-active course. The
  pagination gap that made per-item pruning unsafe is now fixed
  (`canvas-extension/background.js`'s `getCanvasData()` follows Canvas's
  `Link`-header `rel="next"`, verified this session) — per-item pruning
  itself is still not implemented, just no longer blocked on this.
- **New, from the 2026-09-06 cleanup pass**: gamification state
  (`totalXp`/`awardedTaskIds`) moved from `localStorage` to a per-user
  `GamificationState` Prisma row (see Architecture Decisions) — not
  tested against a real logged-in session this session (no login
  available); worth confirming XP actually persists across a reload once
  there's browser access, and that existing localStorage-only XP for
  anyone who used the app before this migration isn't silently lost (no
  backfill was written — there was no way to know who to backfill for
  without a user session to read their old localStorage from).
- ~~The `getTaskPriority`-based sort/labels in the weekly grid were
  intentionally not unified with `calculatePriority`-based scoring~~ —
  **resolved 2026-09-07**: the grid sort is no longer `getTaskPriority`-based
  at all (see below), so this is moot; `calculatePriority` still stays
  Up Next/Pomodoro-only, deliberately, per the entry below.
- A task whose course was manually overridden to something other than its
  natural Canvas course will go stale again if that *target* course is
  later renamed (the override stores a name, not a course id). Narrow
  edge case; would need a `courseId`-based override + migration to fix
  properly.
- **The AI-suggested-task course-matching fix below (2026-09-06) also
  hasn't been clicked through live** — same no-login/no-Ollama constraint.
  Worth confirming: set a `displayName` override on a course, accept a
  suggestion for it, and check the resulting card's abbreviation/color
  match that course's other (Canvas-synced) cards, and that
  `EditTaskModal`'s course dropdown pre-selects the real course instead of
  a synthesized one-off option.

## Session log

### 2026-09-09 — fix weekly-grid stacking bugs, redesign completion animation and card sizing

Direct continuation of the previous session's "In Progress" status work,
which shipped a hold-then-slide completion animation and had never been
tested against a real multi-day-bar-heavy week. User reported two bugs with
a screenshot: a multi-day `startAt` bar breaking the stack for unrelated
single-day tasks, and the new completion animation jumping badly (worst for
the topmost card). Two Explore subagents traced both to the same root cause
— no explicit `gridRow`, CSS Grid's non-dense auto-placement using one
shared cursor for the whole week — confirmed with an advisor pass before
writing the fix. Full design and rationale in the Architecture Decisions
entry above ("Weekly grid stacking reworked...").

This ran through several live-tested iterations rather than one plan: the
`gridRow`-packing fix alone was verified first (zero-overlap invariant,
before/after diffs — not screenshot-guessing, per explicit advisor
guidance after the previous session's screenshot-based checks turned out
unreliable), then the user asked for two further changes after seeing it
live: dropping the slide animation for "microsoft planner but flipped
upside down" (completion never moves a task), and reordering bars by
length instead of start date once the packing fix's actual result was
visible. A last visual pass (completed cards shrinking/dimming, active
cards gaining contrast) came from direct feedback that the frozen-in-place
completed tasks were crowding out active ones.

Hit the same concurrent-editing hazard **twice** this session, both times
on `AssignmentCard.tsx` — see the "concurrent-session hazard hit twice"
bullet in the Architecture Decisions entry for the full account, including
a real false alarm it caused (a styling change that looked completely
inert live for a few minutes, chased as a possible CSS bug, that was
actually just a peer session's concurrent edit delaying Turbopack's CSS
regeneration).

Verified: `npx tsc --noEmit` clean, `npm run lint` unchanged from the
15-problem baseline, `npm run build` clean — all three re-checked after
the peer session's course-color changes merged in, not just before.
Live-verified via the Chrome extension against the real logged-in
account's real data throughout, including the exact scenario from the
user's screenshot. Disposable custom test tasks (created via
`POST /api/custom-tasks`, deleted after) were used for every completion
click needed during verification; explicitly checked `GET /api/gamification`
afterward and confirmed none of the test task ids were ever added to
`awardedTaskIds` and `totalXp` matched pre-test real activity — so, unlike
the previous session, no XP-revert dance was actually needed this time,
but it's still worth checking every time rather than assuming a custom
task can't trigger a real award (it can; `awardXpForTask` doesn't
distinguish custom from real tasks).

### 2026-09-09 — fix bar ordering and rearchitect away the row-height gaps

Direct continuation of the same day's grid-stacking session above, after
a fresh screenshot from the user surfaced two more problems in what had
just shipped: bars sorted by span-length looked chronologically wrong
once bars had real varied start dates (Wed-due above Fri-due above
Thu-due — "it doesn't even make sense lol"), and large, inconsistent gaps
had appeared under some completed cards. Went through Plan Mode for this
one (the previous round's fixes had been small enough to just do live);
an `advisor` pass on the draft plan caught three real issues before any
code was written: the planned flat-percentage `left`/`width` for cards
would drift out of alignment with the divider grid's real `gap-2` math
(worst at Fri/Sat — same class of bug as an earlier NaN-column
misalignment issue), the planned fixed card-height constants hadn't
actually been verified across more than one card, and dropping
`GridSpan.gridColumn` needed a fresh repo-wide grep first since two other
sessions had touched this exact area earlier the same day. All three were
folded into the plan before implementing (see the Architecture Decisions
entry above, "bar ordering fixed to due-date ascending... rearchitected
away", for the full technical account) rather than discovered after the
fact.

`ListAgents` showed the peer session (`student-planner-c0`) idle before
starting, so no pause was needed this round. Live verification went
beyond the previous rounds' spot-checks: rather than eyeballing a
screenshot, pulled every real weekly-grid card's `getBoundingClientRect()`
via the Chrome extension's JS execution tool and asserted the invariants
directly — zero pairwise overlaps among cards sharing a column, every
card's left/right within ~0.15px of its divider column's edges across
all 7 columns (not just column 1), the tallest column's last card ending
exactly at the container's rendered height (no clip/drift), and exactly
40px between consecutive stacked completed cards. Caught one of my own
mistakes mid-verification: two pixel-coordinate clicks aimed at a real
production task's status toggle actually landed on the card body (just
revealing hover-only buttons, confirmed via no visual/API state change),
which was the reminder to stop guessing screen coordinates and instead
query the toggle button's own `getBoundingClientRect()` (or call
`.click()` on it directly) for anything that changes real state.

Verified: `npx tsc --noEmit`, `npm run lint` (same pre-existing 15-problem
baseline, 0 new), `npm run build` all clean. Used one disposable custom
test task for the completion-click check, confirmed the expected +20
XP/+1 awarded-id via `GET /api/gamification`, then reverted both via
`PATCH /api/gamification` back to the exact pre-test baseline before
deleting the test task — same discipline as every other round this
session.

### 2026-09-09 — replace the monotonic-cursor packer with real skyline packing

Direct continuation of the same day's grid-stacking work, after yet
another fresh screenshot: Thursday's column sat almost empty while its
bars rendered far down the page, described as "not making use of as much
space as possible." Diagnosed live (not assumed) via
`getBoundingClientRect()`: three completed bars due Wednesday had a
leftover `startAt` of Tuesday, so they span `[Tue, Wed]`; the packer's
one-number-per-column cursor inherited Tuesday's 9-item congestion into
column 3 and propagated it into every later bar sharing that column,
even across a genuine ~200px gap in column 3 that nothing was using.

First implementation attempt collapsed completed bars to single-day
width at their due column, removing the cross-column coupling outright.
It worked and was live-verified, but the user rejected it on sight: a
completed bar's original span is real information and must stay full
width. Reverted completely, in-session, before any further work — worth
noting as a real example of "verified working" not being the same bar as
"what the user actually wants."

The actual fix needed true gap-filling (a skyline packer: real occupied
intervals per column, not a monotonic cursor), which immediately reopened
the ordering question from the earlier bar-sort round: the only way to
reach that Thursday gap is to let a bar render above an earlier-due bar
sharing a column. An `advisor` pass caught this precisely — flagged it as
a real fork requiring the user's call, not an implementation detail — so
asked directly via `AskUserQuestion` instead of guessing a second time.
The user's answer was sharper than either offered option: due-date order
must hold *within* completed bars and *within* active bars separately,
but not *between* the two groups. Implemented as a second, smaller
monotonic floor keyed by status-group alongside the skyline (see the
Architecture Decisions entry above for the algorithm and the proof that
single-day items need no such floor at all).

Before writing any code, hand-traced the algorithm against the real
current data and got a `advisor`-reviewed prediction table (exact `top`
values per card, and the task layer's `totalHeight` dropping from 888 to
720) — then implemented and confirmed the live DOM matched every
predicted number exactly, plus an explicit ordering-invariant assertion
(same status + shared column ⇒ earlier due date ⇒ smaller `top`; zero
violations) and the existing zero-overlap invariant (also zero). This is
a stronger verification bar than previous rounds' "did it move in the
right direction" checks, and worth repeating for future packing changes:
predict the number before you run the check.

Verified: `npx tsc --noEmit`, `npm run lint` (same 15-problem baseline, 0
new), `npm run build` clean. No completion clicks were needed (pure
layout change); `GET /api/gamification` was checked anyway as a cheap
sanity pass and showed XP had moved (460→510, one awarded id) from real
activity elsewhere during the session (the user's own account, actively
in use) — correctly left untouched, since only test-task XP from this
session's own disposable tasks is ever reverted, never real activity.

### 2026-09-09 — user-customizable course badge color

User asked to be able to customize the color of the class/course label
shown on planner cards, persisted to the DB. Followed the exact same
"user override on `CanvasCourse`, sync never touches it" pattern already
proven for `abbreviation` (see the abbreviation entry above): new
`CanvasCourse.color String?` column (migration `add_course_color`, hex
string like `"#3b82f6"`, null = auto), threaded through
`GET/POST /api/courses` and `PATCH /api/courses/[courseId]` (same
empty-string-clears-the-override convention as `abbreviation`, plus a
`/^#[0-9a-fA-F]{6}$/` validation on PATCH), `types/course.ts`'s `Course`.
Extracted the existing hash-based default-color picker out of
`AssignmentCard.tsx` into a new `lib/courseColor.ts` (`courseColorDefault`)
so `ManageCoursesModal.tsx` could reuse the exact same default for its
"no override yet" swatch preview, rather than duplicating the hash.
`AssignmentCard.tsx`'s badge takes a new `courseColor` prop: renders via
inline `style.backgroundColor` when set (arbitrary hex, not expressible as
a Tailwind class) instead of the `courseColorDefault` Tailwind class.
`ManageCoursesModal.tsx` adds a small circular swatch button next to each
course's abbreviation editor (mirrors that editor's edit/Save/Cancel
pattern) that opens a native `<input type="color">`, plus a "Reset" button
(only shown once a course has a custom color) to clear back to the
auto-derived default.

Verified: `npx tsc --noEmit` clean (only after `npx prisma generate` —
forgot it once, caught immediately by 6 "'color' does not exist" errors),
`npm run lint` at the same pre-existing 15-problem baseline (0 new; the one
touched-file hit, `ManageCoursesModal.tsx:33`, is a pre-existing unrelated
`set-state-in-effect` warning), `npm run build` clean. Live-verified via
the Chrome extension against the real logged-in account: set Biology's
badge to blue in Manage Courses, confirmed the PATCH persisted (dot stayed
blue after a full page reload), confirmed the real planner grid's BIOLOGY
badges rendered blue, then clicked Reset and confirmed it reverted to the
original auto-derived red — full round trip, not just a save.

### 2026-09-08 — add an "In Progress" task status

User asked for a way to mark a task as started/paused without it counting as
done. Full design and file-by-file changes in the Architecture Decisions
entry above ("Added a third task status..."). Planned via `/plan` (see
`~/.claude/plans/can-you-add-the-warm-cook.md`) with two Explore subagents
mapping the existing completion data flow (DB → API → `WeeklyPlannerView`
state → card) and the UI render sites first, then an advisor pass before
writing the plan — settled the schema question (one `inProgress` boolean,
no timestamp) and caught the four-not-three completion-toggle call sites
(the "eat this frog" panel's "Mark done" button is easy to miss). User then
asked for a circular tri-state control instead of a checkbox and a
satisfying completion animation (pulse + hold + slide to the bottom) via
follow-up `AskUserQuestion` rounds, and confirmed the "lightweight,
transform-only, no new dependency" approach for the slide over a heavier
animation-library option.

Mid-session, an active peer session (`remove-short-title-feature`) was
found editing the exact same files concurrently — paused all edits to the
contested files until the user confirmed it had gone idle, then re-read
everything fresh before continuing (see the Architecture Decisions entry's
"Coordination note").

Verified: `npx tsc --noEmit` clean, `npm run lint` (15 problems, all
pre-existing/unrelated — the one new warning this work introduced was
caught and fixed), `npm run build` clean, `npx prisma migrate dev` +
`npx prisma generate` for the new column. Live-verified via the Chrome
extension against the real logged-in account: full status-cycle
click-through with `getComputedStyle`/aria-label checks at each step,
confirmed both in-progress and completed states survive a page reload
(real DB persistence), confirmed the `EditTaskModal` Status dropdown
renders and pre-selects correctly. Live testing awarded real XP/a
procrastination-history record on 3 real tasks; the XP was precisely
reverted (exact before/after totals were known), the single stray
procrastination record was not (no delete endpoint, low stakes, risk of
deleting real data instead) — see Active TODOs.

### 2026-09-07 — fix grid-wide card misalignment (regression from the DB-migration session, same day)

User reported every card shifted right, misaligned from the day dividers, and
correctly attributed it to the DB-migration session specifically rather than the
earlier stacking-order one — right call. First hypothesis (a pre-existing
`calculateGridSpan` "runway bar from today" default) was wrong and was corrected
by the user before any code changed; re-diagnosed properly via live DOM
inspection (`getComputedStyle`, inline `gridColumn` values, direct DB queries on
the two broken tasks) rather than re-guessing. Full root cause and fix in the
Architecture Decisions entry above ("Fixed a real grid-wide rendering
regression..."): a `completedAt` date-serialization format mismatch between two
API routes, introduced by this same day's earlier migration session, producing
`NaN` grid columns for completed tasks.

Verified: `npx tsc --noEmit` (clean), `npm run lint` (19-problem baseline, 0
new), `npm run build` (clean), and live via the Chrome extension — confirmed the
`gridTemplateColumns` blowout (9 tracks → 7) and visual alignment were both
fixed against the exact same real data used to diagnose the bug.

### 2026-09-07 — migrate remaining browser-local planner state to the database

Same day, later session — different issue from the stacking-order/override
work below. User reported the planner open in two Chrome profiles (same
account, different OS-level Google logins) wasn't sharing custom tasks or
"custom class abbreviations." Root cause and full design in the Architecture
Decisions entry above ("All remaining browser-local planner state moved to
the database"). Overwrote the prior plan file (different task) rather than
extending it; a research subagent audited every `localStorage` key in the
app first, then an advisor pass before writing the plan corrected the
initial design (relational per-task state, not a `GamificationState`-style
blob, given this user's literal two-windows-open setup) and caught a
missing merge-safety rule.

Verified: `npx tsc --noEmit` (clean), `npm run lint` (exact 19-problem
baseline, 0 new — one new lint error was introduced mid-session, a real
`useEffect`-closure-ordering issue, and fixed by reordering rather than
suppressed), `npm run build` (clean, new routes present), `npx prisma
migrate dev` + `npx prisma generate`. Live-verified via the Chrome
extension against this session's own real logged-in data — not synthetic
fixtures — which is what surfaced two real bugs (stale-shaped cached
estimates, the effect-ordering lint error) that synthetic testing would
likely have missed; full account in the Architecture Decisions entry.
Deleted `lib/taskState.ts`/`types/taskState.ts` (confirmed fully unused
after the rewire) rather than leaving them as dead code.

### 2026-09-07 — fix weekly grid stacking order, let users override any task field

Two user-reported issues, planned via `/plan` (see full plan/context in
`~/.claude/plans/an-issue-im-seeing-lucky-kitten.md`) then implemented:
stacking order in the weekly grid was "weird" (midday-due tasks weren't
sorting above end-of-day ones), and AI-guessed fields other than
`shortTitle`/`course` (specifically the HW/R/EXAM/TODO type badge, plus
`name`/due-date edits on Canvas-synced tasks) couldn't be corrected — the
edits were silently accepted by the form and then discarded. Full
rationale and file-by-file changes in the two Architecture Decisions
entries above ("Weekly grid stacking order..." and "Any task field is now
user-overridable..."). Two Explore subagents mapped the existing sort
logic and the existing `TaskCustomization.course` override pattern before
any code was written; an advisor pass ahead of the plan file caught the
DST-unsafe millisecond-sum idea, the `grid-flow-row-dense` interaction,
the `tasksWithoutDueDate` scope gap, and the `name`/`due` persistence gap
that hadn't been in the initial plan sketch.

Verified: `npx tsc --noEmit` (clean), `npm run lint` (exact pre-existing
19-problem baseline, 0 new), `npm run build` (clean, all routes
generated), `npx prisma migrate dev` + `npx prisma generate` for the new
`TaskCustomization` columns. Live-verified via the Chrome extension against
the real logged-in account's real data (see the two Architecture Decisions
entries for specifics) — the first time this session's stacking-order fix
and the type-override path were confirmed against actual rendered cards
rather than just reasoning about the code; `nameOverride`/`dueAtOverride`
and a real Canvas re-sync are not yet live-verified (see Active TODOs).

### 2026-09-06 — fix the announcement window's week-start mismatch (Chrome extension used to debug live)

Direct continuation of the time-range work below: user tested it and still
saw 13 announcements when expecting ~6, and specifically suspected deleted
courses leaking through or an unscoped bulk Canvas pull. Investigated both
via code (an Explore agent traced every course-delete/hide/restore/sync
code path with file:line citations) and **ruled both out**: "delete" is a
real cascading Prisma row delete (`app/api/courses/[courseId]/route.ts`),
and the announcement fetch is already correctly per-course
(`canvas-extension/background.js`'s `fetchCourseData`, `context_codes[]=
course_${course.id}`). Initially proposed a diagnostic-only follow-up
(per-course breakdown in the preview) rather than a code fix, since nothing
in the code read as wrong — user rejected that and asked for a more
detailed look, explicitly offering the Chrome extension to click around
live. That's what actually found it: opened the real app, read the
planner's own displayed "This week" (Sep 6–Sep 12) against the dry-run
API's actual `filtering.rangeStart/rangeEnd` (Aug 26–Sep 6) via the page's
own `fetch(...)` in the JS console — a full week off. Root cause and fix
in the Architecture Decisions entry above ("Real bug found and fixed via
live testing"). This is the first session where live browser access
(Chrome extension) was available and used for verification rather than
flagged as an unavailable TODO — directly responsible for catching a bug
that pure code-reading had already (wrongly) cleared twice.

Verified live end-to-end: re-ran the same dry-run fetch post-fix,
`announcementCount` 13 → 6, exactly one announcement per course for all 6
active courses. Also `npx tsc --noEmit`, `npm run lint` (19-problem
baseline, 0 new), `npm run build`, and an 11-check throwaway `npx tsx`
script covering three different "today" values (Sunday, Wednesday,
Saturday) so the fix isn't only verified for the one boundary case that
exposed it.

### 2026-09-06 — announcement analysis time-range control (same session, right after live-testing the Haiku migration)

User tested the just-shipped Haiku extraction path live and had to abort —
too many announcements were being analyzed at once in one run (slow, and
now real per-call cost). Asked for a time filter, a menu to control it, and
a default as small as possible without dropping real announcements —
restating almost exactly the window already hardcoded in
`app/api/ai/analyze-announcements/route.ts` ("most announcements come out
by the Wednesday of the previous week"). Confirmed via code read that the
default window was already correct; the actual gaps were invisibility (no
preview before an expensive run) and no way to adjust it. Full design and
file-by-file changes in the Architecture Decisions entry above ("Announcement
analysis now has a user-visible..."). Used a Plan subagent to detail the
route/component implementation before writing code, given the touched
surface (an existing route's request/response shape, plus new client state)
warranted a second look before committing to the diff.

Verified with `npx tsc --noEmit` (clean), `npm run lint` (exact pre-existing
19-problem baseline, 0 new — one new `react-hooks/set-state-in-effect` was
introduced and then removed by restructuring the effect's early-return guard
to not need a synchronous `setState`, since the disabled/label logic already
falls back to `rangeIsInvalid` independent of a possibly-stale
`previewCount`), `npm run build` (clean), a logged-out `curl` smoke test
(both the no-body and `dryRun:true` shapes still 401), and a throwaway `npx
tsx` script duplicating the route's pure date-math helpers (can't import
them directly — `route.ts` only permits recognized Next.js route-handler
exports) — 22/22 checks passed, notably confirming the default window's
Wed-of-prior-week/Sun-of-this-week boundaries are unchanged from before this
session's edit. No login/browser session available to click through the new
UI live this session — see Active TODOs.

### 2026-09-06 — fix announcement AI reliability, move extraction to Claude Haiku

User reported the announcement-extraction Ollama call still frequently
returned invalid JSON or wrong answers despite the 2026-09-07 polish pass,
and reiterated wanting the duplicate checker biased toward false positives.
Two real problems found: (1) no visibility into *why* extraction failed
(truncation vs. model capability) and a fragile `index`-based join between
model output and request; (2) `findDuplicateTask.ts` had two code paths that
silently discarded a genuine `isDuplicate: true` verdict and reported "not a
duplicate" — the bias was already tuned in the prompt from a prior session,
but violated in code. User separately added `ANTHROPIC_API_KEY` (~$10
credit, explicitly cost-cautious) and asked to use Claude Haiku for
"whatever needs more power" — decided (with the user, via AskUserQuestion)
to move only announcement extraction to Haiku (forced tool use), keeping the
duplicate checker on local Ollama since it runs ~5x more often per review
and its prompt is already tuned. Full rationale and file-by-file changes in
the Architecture Decisions entries above (search "Claude Haiku" and "false-
negative bugs fixed").

Verified: `npx tsc --noEmit` (clean) and `npm run lint` (baseline unchanged,
0 new issues in any file this session touched). Built a throwaway `npx tsx`
verification harness (deleted after, same precedent as
`lib/prioritization.test.ts`) covering:
- 4 deterministic mocked-fetch unit tests for the `findDuplicateTask.ts`
  bug fixes (unresolvable-id-stays-flagged ×2, no-nearby-assignments-is-
  checked-not-degraded, positional-index-fallback) — **all 4 passed**.
- 1 live call against the real local Ollama server
  (`qwen2.5:3b-instruct`) with a realistic 3-task/2-assignment fixture:
  `done_reason: "stop"` (no truncation), valid schema-constrained JSON,
  correctly flagged both real duplicates (including the "proposed task is
  part of a larger Canvas assignment" case) and correctly did NOT flag an
  unrelated task — the schema/logging hardening works as intended.
- 2 live announcement-extraction calls intended to test Claude Haiku — but
  a first attempt silently exercised the **Ollama fallback** instead,
  because a bare `npx tsx` script doesn't auto-load `.env` (unlike `next
  dev`/`next build`) so `ANTHROPIC_API_KEY` read as unset; that Ollama run
  (fixed by adding `import "dotenv/config"`) actually produced a good
  result — a Chinese-language announcement, a table-based announcement, a
  no-actionable-work announcement, and a multi-task announcement were all
  handled correctly (right dueText preserved verbatim including the
  Chinese-wording case, correctly zero tasks for the pure-reminder case).
  Once `.env` was actually loaded, the **real** Haiku calls all failed with
  `401 authentication_error: "API key is invalid."` — a bad credential, not
  a code bug (see the blocking Active TODO above); the failure path itself
  (typed-error handling, bisect-once-to-singles retry, per-announcement
  degrade) behaved exactly as designed with no crash. Real Haiku output
  quality is therefore **not yet verified** — needs a valid key and a
  re-run.

### 2026-09-06 — restore a deleted Canvas course

Added a way to bring back a Canvas course after using the (real, hard) course
delete in `ManageCoursesModal.tsx` — previously the only way back was an
automatic full sync, and only if Canvas still reported the course `active`
(a concluded/past-term course could never come back). Since Canvas access is
only possible from the extension (browser session cookies, no server-side
token), the restore trigger lives in the extension popup, per explicit user
direction, rather than building a new web-app↔extension messaging bridge.

- Extracted the course/assignment/discussion/announcement upsert logic and
  the session/Bearer-token auth resolution out of
  `app/api/canvas/sync/route.ts` into new `lib/canvasIngest.ts`
  (`upsertCanvasCourses`, `getCanvasSyncUserId`) — pure refactor, sync route's
  request/response shape and pruning behavior are unchanged.
- New `POST /api/canvas/restore-course` route reuses those same helpers but
  **never prunes** — safe to call for one course without risking any other
  course's data, unlike `/api/canvas/sync`.
- `canvas-extension/background.js`: extracted `fetchCourseData()` (shared by
  the existing full-sync loop and the new flow), added `LIST_CANVAS_COURSES`
  (fetches both `active` and `completed` Canvas courses — a deliberate
  difference from the existing `active`-only `GET_COURSES`/`SYNC_CANVAS`
  fetches, since a concluded course is exactly the case that needed fixing)
  and `RESTORE_COURSE` (fetches one course's data and posts it to the new
  route) message handlers.
- `canvas-extension/popup.html`/`popup.js`: new "Find Canvas Courses" →
  select → "Restore Course" flow, mirroring the existing Connect/Sync button
  patterns (`setStatus`/`describeError`, disable-while-in-flight).
- `ManageCoursesModal.tsx`: one added sentence pointing users at the
  extension popup for restoring a deleted course.

Verified with `npx tsc --noEmit` (clean), `npm run lint` (same pre-existing
baseline, 0 new issues in changed files), `npm run build` (confirms the new
`/api/canvas/restore-course` route), and `node --check` on both edited
extension JS files. No login, live Canvas account, or unpacked-extension
reload available this session — see Active TODOs for the real-world
verification this still needs. Also surfaced (not fixed) a related latent
issue: the sync route's pruning deletes a **hidden** course too once it
drops off Canvas's active list, not just a never-hidden one — see Active
TODOs.

### 2026-09-06 — card course segment consistency fix

User reported cards sometimes showing the full course name ("Linear
Algebra") instead of the abbreviation. Root cause: the course/due-date
segments were already fully deterministic (`courseAbbreviationDefault`/
`classifyLabelType`/`dayCode` in `lib/taskLabel.ts`, no network calls) —
the actual cause was a width-adaptive `@[200px]` container-query toggle in
`AssignmentCard.tsx` (an earlier session's unverified breakpoint guess)
showing the full name on wider cards. Removed the toggle entirely —
`courseAbbreviation` now always renders regardless of card width (see
Architecture Decisions).

Also flagged, not acted on: multiple sessions editing this same working
tree concurrently (visible via `git reflog`) is a real recurring hazard —
see the later concurrent-editing notes elsewhere in this file.

(A same-session fix for AI-approved announcement tasks not getting a
short title, and its underlying `generateShortTitles` hallucination
guard, are both moot now — that whole feature was removed 2026-09-09.)

### 2026-09-06 — fix AI-suggested tasks not matching their real course

Same session as the card course segment fix above. User reported that
AI-suggested (accepted-announcement) tasks don't get grouped under the same
course as a real Canvas-synced task for that course — they render as if
they belong to a different, unmapped course.

Root cause: `app/api/ai/analyze-announcements/route.ts`'s "Convert
announcements" step built each `Announcement.course` from the raw
`course.name` Prisma field, while every other place in the app that turns a
`CanvasCourse` row into a display-facing string already uses the
override-aware `displayName ?? name` resolution (`lib/canvas.ts`'s
`getAllAssignments`, `app/api/courses/route.ts`). So a user who renamed a course via
Manage Courses saw the friendly name on Canvas-synced tasks but the raw
Canvas name on AI-suggested tasks for the same course — two different
strings for the same course, all the way through
`ProposedTask.course`/`sourceAnnouncement.course`
(`lib/ai/analyzeAnnouncement.ts`) to the accepted `plannerTask.course`
(`AIReviewPanel.tsx`'s `handleAccept`), since these tasks are never
persisted (no DB row to re-resolve against later — see the fix above).
That mismatch broke every downstream string-match: `WeeklyPlannerView.tsx`'s
`courses.find((c) => c.name === task.course)` (course abbreviation,
`isCustomCourse`), `AssignmentCard.tsx`'s course-color hashing, and
`CourseSelect.tsx`'s dropdown pre-selection (synthesized a fake one-off
course option instead of finding the real one).

Fix: `course: course.displayName ?? course.name` at the point
`Announcement.course` is built, plus updating `nearbyAssignmentsFor`'s
`courses.find((course) => course.name === announcement.course)` join to
match on the same resolved value (`(course.displayName ?? course.name) ===
announcement.course`) — otherwise that internal duplicate-detection lookup
would've silently broken instead, once `announcement.course` no longer
matched the raw name it used to compare against. Nothing else needed to
change; every downstream consumer already just propagates this string
unmodified. Confirmed `lib/suggestionKey.ts`'s `computeSuggestionKey`
hashes only `sourceAnnouncementId + name` (not course), so this doesn't
invalidate any already-accepted/rejected suggestion decisions.

Verified with `npx tsc --noEmit` (clean) and `npm run lint` (0 new issues
in the changed file). Not verified live — no login/Ollama this session,
see Active TODOs.

### 2026-09-07 — announcement analysis pipeline polish pass

Full pass over the announcement→suggestion→duplicate-check→review flow
per direct user feedback ("pretty trash," duplicate-check UI "really
ugly," raw HTML shown, Ollama inconsistent, stale re-suggestions). Full
rationale in the Architecture Decisions entry above; summary here.

Fixed: raw-HTML display (new `stripHtmlForDisplay` in `lib/htmlText.ts`)
plus new evidence highlighting (`lib/evidenceHighlight.ts`) in
`AIReviewCard.tsx`; `lib/ai/analyzeAnnouncement.ts` consistency
(`temperature: 0`, `AbortSignal.timeout`, system message, per-task field
validation) — same `AbortSignal.timeout` fix also applied to
`lib/ai/findDuplicateTask.ts`; new `lib/dueText.ts` deterministic
`dueText`→date parser, resolved client-side in `AIReviewCard.tsx`; new
`AnnouncementSuggestionReview` Prisma model + `lib/suggestionKey.ts` +
`POST /api/ai/suggestion-review` persisting accept/reject decisions,
wired into `AIReviewPanel.tsx` and filtered in
`app/api/ai/analyze-announcements/route.ts` (automatic mode only); new
`canvasMatch.status: "unavailable"` (via `findDuplicateTask.ts`'s new
`checkStatus` field) distinguishing a degraded/failed duplicate check from
a genuine no-match, rendered as a distinct grey box in `AIReviewCard.tsx`.
Deleted dead-code `lib/ai/selectRelevantAnnouncements.ts` (never wired in;
superseded by the persisted-review-state fix). Also fixed a latent
`AIReviewCard` bug the due-date work exposed (state not resetting between
suggestions) by keying it on `suggestionKey` in `AIReviewPanel.tsx`.

Verified with `npx tsc --noEmit` (clean), `npm run lint` (same pre-existing
baseline, 0 new issues in changed files), `npm run build` (confirms the
new `/api/ai/suggestion-review` route), `npx prisma migrate dev` +
`npx prisma generate` (migration `20260907004906_add_announcement_suggestion_review`
applied), and a standalone `npx tsx` spot-check of `lib/dueText.ts` against
synthetic inputs. No Ollama server or logged-in browser session available
this session — see Active TODOs for the real-world verification this
still needs.

### 2026-09-06 — remove redundant AnalyzeAnnouncementsButton

`app/page.tsx` rendered two separate triggers for the same
`/api/ai/analyze-announcements` call: `AnalyzeAnnouncementsButton.tsx`
(just `console.log`ged the result, no UI outcome) and `AIReviewPanel.tsx`
("🤖 Review AI Suggestions", the real accept/reject/edit flow). Confirmed
redundant, deleted `components/AnalyzeAnnouncementsButton.tsx` and its
import/usage in `app/page.tsx`. `AIReviewPanel` is now the only
announcement-analysis entry point.

### 2026-09-06 — fix broken announcement analysis, bias duplicate detection, loading indicators

User tried announcement analysis for real and got zero results — every
batch either timed out after 25s or came back malformed, across all 13
selected announcements (real logs pasted, including Chinese-titled
announcements like "第三周与第四周之计划" — a real class). Root cause:
`announcement.message` is Canvas's raw, unbounded HTML, passed straight
into the Ollama prompt with zero stripping or length cap (unlike
`lib/ai/findDuplicateTask.ts`, which already caps assignment descriptions
at 500 chars for the identical reason) — a batch of 5 real announcements
could blow past Ollama's context window, which was never set explicitly
anywhere in this codebase.

Fixed:
- New `lib/htmlText.ts` (`stripHtml`, `truncateText`) extracted from
  `findDuplicateTask.ts`'s previously-private HTML stripper, now shared.
- `lib/ai/analyzeAnnouncement.ts`: caps each announcement's message to
  1200 chars (stripped of HTML) before it enters the prompt; the
  per-entry validation that used to `throw` on one malformed entry and
  fail the **whole batch** now degrades just that entry to "no
  extractable tasks" (same per-item-degradation fix as
  `findDuplicateTask.ts` from the previous session — this file had the
  identical bug, just missed in that audit since it required looking at
  message *content size*, not just error-handling structure); timeout
  bumped 25s → 35s as a safety margin on top of the real fix.
- `lib/ollamaConfig.ts`: added `OLLAMA_NUM_CTX = 8192`, now set on all 5
  Ollama call sites — nothing set this before, so every request silently
  relied on whatever the pulled model's Modelfile defaulted to.
- **Duplicate detection now skews hard toward false positives**, per
  explicit direction: a wrongly-flagged duplicate costs one click to
  reject (confirmed by reading `AIReviewCard.tsx` — a flagged duplicate
  shows a clear amber banner + reasoning right next to Accept/Reject); a
  missed real duplicate shows nothing and silently clutters the planner.
  Rewrote `findDuplicateTask.ts`'s DECISION section: NOT DUPLICATE is now
  reserved for *clearly* different work; any plausible overlap, even
  weak, routes to DUPLICATE at LOW confidence instead. No route/status-
  mapping change needed — `isDuplicate:true` + `confidence:"low"` already
  rendered as "possible duplicate" in the UI.
- **Loading indicators added across every identified gap** (full survey
  done via fresh code audit this session, not guessed): new
  `components/Spinner.tsx` (indeterminate), applied to: `awardXpForTask`'s
  XP calculation (new `awardingXp` state), `MusicPlayer.tsx`'s
  rename/delete playlist/track (previously no busy state at all — new
  shared `busyItemId`), and consistency upgrades to `CourseSelect.tsx`'s
  create button and `ManageCoursesModal.tsx`'s per-row Save buttons
  (labels didn't change while busy before). Existing good indicators
  (`AIReviewPanel.tsx`, `ManageCoursesModal.tsx`'s course list load,
  `MusicPlayer.tsx`'s playlist load/import) got the spinner added
  alongside their existing text for a stronger visual cue.

Verified with `npx tsc --noEmit`, `npm run lint` (18 → 19 problems — the
one new one is a state setter called directly in an effect
body, the exact same already-accepted `set-state-in-effect` pattern as
the pre-existing, adjacent `setEstimatingCount` call — not a new class of
issue), `npm run build`, and a synthetic `npx tsx` script (deleted after)
confirming `stripHtml`/`truncateText` actually bound a 6000+ char
HTML string down to ~1200 chars. Could not reproduce the original
failure end-to-end (no login, no real Canvas data) — see Active TODOs.

### 2026-09-06 — pre-gamification cleanup pass

Before starting `gamificationSystem.md`, did a readiness audit (3 parallel
code-quality passes over the AI pipeline, priority/XP scoring, and general
code health) rather than assuming the codebase was ready. Verdict: not
broken, but a handful of concrete gaps worth closing first — not a full
rewrite. Not yet committed.

Fixed:
- `lib/ai/findDuplicateTask.ts` — the real explanation for "findDuplicateTasks
  occasionally misses an obvious duplicate" (previously blamed on "3B
  model variance") is that its per-entry validation `throw`n on ANY
  malformed/inconsistent entry, and the caller
  (`app/api/ai/analyze-announcements/route.ts`) responded to that throw
  by blanking out `canvasMatch.status: "none"` for **every** task in that
  announcement — including tasks whose own entry was correct. Changed
  the per-entry checks to `return fallbackResult(...)` for just that
  entry instead of throwing; function-level failures (timeout, non-2xx,
  unparseable JSON, missing `results` array) still throw. Caller needed
  no change — its catch-all is still the correct last resort for those.
- New `lib/ollamaConfig.ts` (`OLLAMA_CHAT_URL`, `OLLAMA_MODEL`) — was
  duplicated 5 ways with real inconsistencies (3 call sites hardcoded the
  URL, ignoring `OLLAMA_URL`; the 2 that read it disagreed on whether it
  already included `/api/chat`), currently masked only because everyone
  defaulted to the same address. All 5 Ollama call sites now import this;
  the 4 missing `format: "json"` on their request now set it (only
  `task-xp` had it before) — malformed JSON was one of the triggers for
  the `findDuplicateTask.ts` bug above, so this closes off that failure
  mode more broadly, not just there.
- Gamification state moved from `localStorage` to a new `GamificationState`
  Prisma model/`app/api/gamification` route (full rationale in
  Architecture Decisions above) — your call, given gamification is about
  to make this state matter far more than it used to.
- `canvas-extension/background.js`'s `getCanvasData()` now follows
  Canvas's `Link`-header pagination (`rel="next"`) instead of only ever
  fetching page 1 — confirmed real: every one of its 8 call sites
  requests `per_page=100` with no follow-up, so a course with more than
  100 assignments/discussions/announcements was silently losing
  everything past page 1. Fixed in one place (the shared helper); no
  call site needed to change since all of them already just await a flat
  array.

Explicitly deferred (real, but lower-severity or already-deliberate —
see the plan file / ask before assuming these are next):
`WeeklyPlannerView.tsx`'s size (1332 lines), the `getTaskPriority` vs
`calculatePriority` divergence (already known/deliberate), no automated
regression tests for `calculatePriority`, `react-hooks/exhaustive-deps`
warnings in `MusicPlayer.tsx`/`PomodoroTimer.tsx`, leftover debug
`console.log`s, a stale CLAUDE.md claim about `analyzeAssignment.ts`.

Verified with `npx tsc --noEmit`, `npm run lint` (identical 18-problem
baseline, 0 new), `npm run build`, and a logged-out dev-server smoke test
(`/api/gamification` correctly 401s). No login/Ollama-in-the-loop testing
this session — see Active TODOs.

### 2026-09-06 — task name normalization (compact card labels)

Added the `COURSE - TYPE - DAY - ...` compact card label replacing the raw
assignment name as each card's title, plus `CanvasCourse.abbreviation` and
`classifyAssignmentType` extraction — the parts of this that are still
current are described in Architecture Decisions above
(`formatTaskLabel`/`classifyLabelType` in `lib/taskLabel.ts`). Committed
as `f9c8836` ("Add normalized task-name labels for planner cards"). This
session also introduced the AI-generated `shortTitle` segment
(`lib/generateShortTitle.ts`, `app/api/task-short-titles`,
`Assignment.shortTitle`) that several later sessions iterated on and then
fully removed 2026-09-09 — none of that code exists anymore.

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
