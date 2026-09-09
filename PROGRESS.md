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

- **Not a bug, don't "fix" again**: the skyline packer leaves two small
  unfilled gaps in Thursday's column in today's real data — expected,
  since it's greedy first-fit, not maximum-density, and everything that
  could fill them also touches Wednesday's genuinely-busy column.
  Confirmed via a hand-traced, `advisor`-reviewed prediction table before
  implementing.
- Untested: whether `opacity-55` (completed-card dimming) reads right on
  the light theme — only checked against dark so far. One disclosed,
  low-stakes leftover: a stray `ProcrastinationRecord` from live testing
  was never cleaned up (no delete endpoint; risk of deleting real data by
  guessing outweighs the benefit).
- **Browser-local-state migration** (custom tasks, deleted-task
  tombstones, task states, planning estimates, procrastination history):
  verified against real production data and live end-to-end in-session,
  but not yet click-tested: a new custom task syncing to a genuinely
  separate second browser profile; a custom task's `PATCH
  /api/custom-tasks` edit round-trip; a Canvas re-sync not resurrecting a
  deleted task; whether the `task_planning_estimates` per-entry filter
  drops any *valid* estimates beyond the one malformed sample inspected.
- **Task-field overrides**: only `typeOverride` was clicked through
  end-to-end. `nameOverride`/`dueAtOverride` on a Canvas-synced task are
  verified only via `tsc`/lint/build — worth confirming they persist
  across reload and survive a real Canvas re-sync.
- **Announcement-pipeline reliability/cost changes made across several
  sessions** (RULES-block dedup, Ollama duplicate-check concurrency cap,
  bisection retry on batch failure, longer Anthropic timeout,
  message-length cap, per-entry degradation, number-based assignment
  matching, a more aggressive duplicate-detection bias) haven't all been
  re-exercised together against a live Anthropic/Ollama run since
  landing — worth confirming cost actually drops, no timeouts under load,
  and the bias isn't over-flagging obviously unrelated tasks in practice.
- Announcement time-range preset UI (preset switching, the custom-range
  date pickers, the >15 soft-warning) hasn't been separately click-tested
  — the underlying window-math data is confirmed correct, so this is
  purely about the preset UI's own behavior.
- **Restore-a-deleted-Canvas-course** flow (`LIST_CANVAS_COURSES`/
  `RESTORE_COURSE`) is only verified via syntax check + `tsc`/lint/build,
  not a real extension reload/click-through.
- **Known, unfixed**: a **hidden** Canvas course is as vulnerable as a
  deleted one to disappearing for good — sync pruning deletes any
  `CanvasCourse` missing from the latest payload regardless of its
  `hidden` flag, so a hidden-then-concluded course gets hard-deleted, not
  just filtered.
- Announcement-analysis polish (HTML-safe rendering, evidence
  highlighting, due-date resolution, persisted accept/reject state,
  duplicate-check "unavailable" status) hasn't been tested against a live
  Ollama server/logged-in session — `lib/dueText.ts` itself was
  spot-checked standalone against synthetic inputs only.
- **Loading-indicator sweep** (Spinner on XP award, course create/save,
  `MusicPlayer.tsx`'s shared `busyItemId`) was verified only via
  `tsc`/build — never clicked through to confirm each spinner shows and
  clears correctly.
- Canvas sync reconciliation still only prunes whole courses, not
  individual assignments/announcements within an active course (the
  pagination gap that made this unsafe is fixed; the pruning itself isn't
  built).
- A task whose course was manually overridden to a non-Canvas course name
  goes stale again if that *target* course is later renamed (the override
  stores a name, not a course id) — narrow edge case, needs a
  `courseId`-based override to fix properly.
- AI-suggested-task course-matching (uses a course's `displayName`
  override, correct abbreviation/color, correct `EditTaskModal` dropdown
  pre-select) hasn't been clicked through live.

## Session log

### 2026-09-09 — fix weekly-grid stacking bugs, redesign completion animation and card sizing

Continuation of the "In Progress" status work, untested until now against
a real multi-day-bar-heavy week. User reported a multi-day bar breaking
the stack and a jumpy completion animation; root cause (no explicit
`gridRow`, CSS Grid auto-placement sharing one cursor for the week)
traced via two Explore agents + an advisor pass. Full design in
Architecture Decisions ("Weekly grid stacking reworked..."). Iterated
live from there: fixed the packing first, then per user feedback dropped
the slide-to-bottom animation entirely ("completion never moves a task")
and switched bar ordering, then shrank/dimmed completed cards on further
feedback. Hit the same peer-session file-editing collision twice on
`AssignmentCard.tsx` (see Architecture Decisions' "concurrent-session
hazard" note, including a false alarm it caused).

Verified: `tsc`/lint/build clean; live-verified via Chrome extension
against real data, including disposable test tasks confirmed XP-neutral
via `GET /api/gamification`.

### 2026-09-09 — fix bar ordering and rearchitect away the row-height gaps

Same-day continuation: bars sorted by length looked chronologically
wrong once bars had varied start dates, and completed cards left
inconsistent gaps. Went through Plan Mode this round; an advisor pass on
the draft caught a divider-alignment math bug and an unverified
card-height assumption before implementing (full account in Architecture
Decisions). Verified live by pulling every card's
`getBoundingClientRect()` via the Chrome extension and asserting zero
overlaps, sub-pixel divider alignment, and exact 40px completed-card
spacing — stronger than the prior screenshot-based checks.

Verified: `tsc`/lint/build clean; one disposable test-task completion,
XP reverted via `GET`/`PATCH /api/gamification`.

### 2026-09-09 — replace the monotonic-cursor packer with real skyline packing

Same-day continuation: Thursday's column sat nearly empty despite bars
stacking far down the page. Root cause: the packer's per-column cursor
inherited an unrelated column's congestion instead of tracking real
gaps. A first fix (collapsing completed bars to single-day width) worked
but was rejected by the user on sight — a completed bar's original span
is real information. Real fix: a true skyline packer plus a
status-group-scoped ordering rule, decided via `AskUserQuestion` after
an advisor pass flagged the ordering tradeoff as the user's call, not an
implementation detail (algorithm in Architecture Decisions). Hand-traced
predicted numbers before implementing and confirmed the live DOM matched
exactly.

Verified: `tsc`/lint/build clean; pure layout change, no completion
testing needed.

### 2026-09-09 — user-customizable course badge color

Added `CanvasCourse.color`, following the same "user override, sync
never touches it" pattern as `abbreviation`. Extracted the existing
default-color hash into `lib/courseColor.ts` so `ManageCoursesModal.tsx`
could reuse it for its swatch preview instead of duplicating it.
`ManageCoursesModal.tsx` gained a color-swatch button (native color
picker) plus Reset.

Verified: `tsc`/lint/build clean; live-verified via Chrome extension —
set a course color, confirmed it persisted across reload and rendered on
real cards, then confirmed Reset reverted to the auto-derived default.

### 2026-09-08 — add an "In Progress" task status

User wanted to mark a task started/paused without counting it done.
Planned via `/plan` with two Explore agents + an advisor pass, which
settled the schema (one boolean, no timestamp) and caught a 4th
completion-toggle call site that's easy to miss. Followed by
user-requested UI iterations: a circular tri-state control and a
completion animation (full design in Architecture Decisions, "Added a
third task status..."). Hit a concurrent-editing collision with a peer
session on the same files mid-session (paused until it went idle).

Verified: `tsc`/lint/build/migrate clean; live-verified via Chrome
extension, including a full status-cycle click-through and
reload-persistence check. Live testing awarded real XP/a procrastination
record on 3 real tasks — XP was precisely reverted, one stray
procrastination record was not (no delete endpoint, low stakes).

### 2026-09-07 — fix grid-wide card misalignment (regression from the DB-migration session, same day)

User reported cards misaligned from day dividers, correctly attributing
it to that day's earlier DB-migration session. Re-diagnosed via live DOM
inspection after an initial wrong hypothesis was corrected by the user.
Root cause: a `completedAt` date-serialization mismatch between two API
routes producing `NaN` grid columns (full account in Architecture
Decisions).

Verified: `tsc`/lint/build clean; live-verified via Chrome extension
against the same real data used to diagnose the bug.

### 2026-09-07 — migrate remaining browser-local planner state to the database

User reported the planner open in two Chrome profiles wasn't sharing
custom tasks or course abbreviations. Root cause and full design in
Architecture Decisions ("All remaining browser-local planner state moved
to the database"). A research subagent audited every `localStorage` key
first; an advisor pass corrected the initial design (relational per-task
state, not a blob, given this user's literal two-windows-open setup) and
caught a missing merge-safety rule.

Verified: `tsc`/lint/build/migrate clean; live-verified via Chrome
extension against real (not synthetic) data, which surfaced two real
bugs — stale-shaped cached estimates and an effect-ordering lint error —
that synthetic testing likely would have missed. Deleted
`lib/taskState.ts`/`types/taskState.ts` as confirmed-unused dead code.

### 2026-09-07 — fix weekly grid stacking order, let users override any task field

Two user-reported issues planned via `/plan`: grid stacking order
ignored time-of-day, and AI-guessed fields other than course couldn't be
corrected. Full rationale in the two Architecture Decisions entries
above. Two Explore agents mapped the existing sort/override logic first;
an advisor pass caught a DST-unsafe design idea and a missing
`name`/`due` persistence gap before implementing.

Verified: `tsc`/lint/build/migrate clean; live-verified via Chrome
extension. `nameOverride`/`dueAtOverride` and a real Canvas re-sync are
not yet live-verified (see Active TODOs).

### 2026-09-06 — fix the announcement window's week-start mismatch

Continuation of the time-range work below: user still saw 13
announcements when expecting ~6. Code-reading ruled out the two
suspected causes (deleted-course leakage, an unscoped bulk pull) —
wrongly, twice. User pushed back and offered live Chrome-extension
access, which is what actually found it: the planner's displayed "This
week" didn't match the dry-run API's actual date range, a full week off
(root cause and fix in Architecture Decisions, "Real bug found and fixed
via live testing"). First session where live browser access was
available and used for verification rather than flagged as a TODO —
directly responsible for catching what code-reading alone had missed
twice.

Verified live: re-ran the dry-run fetch post-fix, `announcementCount`
13 → 6, exactly one per course for all 6 active courses. Also
`tsc`/lint/build clean, plus an 11-check script covering three different
"today" values.

### 2026-09-06 — announcement analysis time-range control

Same session, right after live-testing the Haiku migration: user had to
abort a run because too many announcements were being analyzed at once.
The existing default window was already correct (confirmed by reading
the code) — the real gaps were no preview before an expensive run and no
way to adjust it. Full design in Architecture Decisions ("Announcement
analysis now has a user-visible..."). Used a Plan subagent given the
touched surface (an existing route's shape plus new client state).

Verified: `tsc`/lint/build clean, a logged-out smoke test, and a
22-check throwaway script duplicating the route's date-math (route files
can't be imported directly). No login/browser session to click through
the new UI live this session.

### 2026-09-06 — fix announcement AI reliability, move extraction to Claude Haiku

User reported the Ollama extraction call still frequently failed despite
an earlier polish pass, and repeated wanting the duplicate checker
biased toward false positives (already tuned in the prompt, but violated
in code — two paths silently discarded a genuine duplicate verdict).
User added `ANTHROPIC_API_KEY`, and via `AskUserQuestion` it was decided
to move only announcement extraction to Haiku (forced tool use), keeping
the duplicate checker on local Ollama (runs 5x more often, already
tuned). Full rationale in Architecture Decisions ("Claude Haiku" and
"false-negative bugs fixed").

Verified via a throwaway test harness: 4/4 deterministic
`findDuplicateTask.ts` bug-fix tests passed; 1 live Ollama duplicate-check
call correctly flagged both real duplicates and correctly cleared an
unrelated task; the first live Haiku attempt silently fell back to
Ollama (a bare script doesn't auto-load `.env`), but that fallback run
still produced correct output across 4 varied fixtures. Once `.env`
loaded, the real Haiku calls failed on an invalid API key — a bad
credential, not a code bug; the failure path (typed errors, bisection
retry, per-item degrade) worked exactly as designed. **Resolved same
session**: the user regenerated the key, and a follow-up live run
confirmed 3/3 Haiku extractions succeeded with correct output quality,
including correctly splitting multi-part assignments into separate
tasks.

### 2026-09-06 — restore a deleted Canvas course

Added a way to bring back a Canvas course after a real (hard) delete in
`ManageCoursesModal.tsx` — previously only a full sync could restore one,
and only if Canvas still reported it `active` (a concluded course could
never come back). Since Canvas access only works from the extension
(session cookies, no server-side token), the restore trigger lives in the
extension popup rather than a new web↔extension messaging bridge.

- Extracted course/assignment/discussion/announcement upsert + auth
  resolution out of `app/api/canvas/sync/route.ts` into new
  `lib/canvasIngest.ts` (pure refactor; sync route's own behavior
  unchanged).
- New `POST /api/canvas/restore-course` reuses those helpers but never
  prunes — safe to call for one course without touching others.
- `canvas-extension/background.js`: extracted shared `fetchCourseData()`,
  added `LIST_CANVAS_COURSES` (active *and* completed courses, unlike the
  existing active-only sync) and `RESTORE_COURSE` handlers.
- `canvas-extension/popup.html`/`popup.js`: new "Find Canvas Courses" →
  select → "Restore Course" flow.

Verified: `tsc`/lint/build clean, `node --check` on the extension JS. No
login/live Canvas/extension-reload available this session — see Active
TODOs. Also surfaced (not fixed): sync pruning also deletes a **hidden**
course once it drops off Canvas's active list — see Active TODOs.

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
AI-suggested (accepted-announcement) tasks didn't share a course with a
real Canvas-synced task for the same course. Root cause: the
announcement route built `Announcement.course` from the raw Canvas name
instead of the override-aware `displayName ?? name` resolution used
everywhere else, so a renamed course produced two different strings for
the same course — breaking every downstream string-match (abbreviation,
color, dropdown pre-select), since AI-suggested tasks are never
persisted and can't be re-resolved later. Fix: resolve `displayName ??
name` at the point `Announcement.course` is built, plus updating the
internal duplicate-detection course lookup to match on the same resolved
value. Confirmed `suggestionKey` hashes only announcement id + name (not
course), so this doesn't invalidate any existing accept/reject decisions.

Verified: `tsc`/lint clean. Not verified live — see Active TODOs.

### 2026-09-07 — announcement analysis pipeline polish pass

Full pass over the announcement→suggestion→duplicate-check→review flow
per direct user feedback ("pretty trash," raw HTML shown, stale
re-suggestions). Full rationale in Architecture Decisions. Fixed:
raw-HTML display + evidence highlighting in `AIReviewCard.tsx`, Ollama
call consistency (`temperature: 0`, timeouts, per-task validation) in
`analyzeAnnouncement.ts`/`findDuplicateTask.ts`, a deterministic
`dueText`→date parser (`lib/dueText.ts`), persisted accept/reject state
(`AnnouncementSuggestionReview` + `lib/suggestionKey.ts`), and a distinct
"duplicate check unavailable" status separate from a genuine no-match.
Deleted dead-code `lib/ai/selectRelevantAnnouncements.ts`.

Verified: `tsc`/lint/build/migrate clean, plus a standalone spot-check of
`lib/dueText.ts` against synthetic inputs. No Ollama/logged-in session
available this session — see Active TODOs.

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
batch timed out or came back malformed. Root cause: `announcement.message`
is raw, unbounded Canvas HTML passed straight into the Ollama prompt with
no stripping or length cap (unlike `findDuplicateTask.ts`'s existing
500-char cap) — a batch could blow past Ollama's context window, which
was never set explicitly anywhere in the codebase.

Fixed: new shared `lib/htmlText.ts` (`stripHtml`/`truncateText`);
`analyzeAnnouncement.ts` caps each message to 1200 chars and degrades
per-entry instead of failing the whole batch on one malformed item (same
bug class as `findDuplicateTask.ts`); `OLLAMA_NUM_CTX = 8192` added and
set on all 5 call sites (previously unset everywhere); duplicate
detection rewritten to skew hard toward false positives per explicit
direction (a wrong flag costs one click; a missed duplicate silently
clutters the planner); loading indicators (new `Spinner.tsx`) added
across every identified gap (XP award, MusicPlayer busy states, course
create/save).

Verified: `tsc`/lint/build clean, plus a synthetic script confirming HTML
truncation actually worked. Could not reproduce the original failure
end-to-end (no login/real Canvas data) — see Active TODOs.

### 2026-09-06 — pre-gamification cleanup pass

Readiness audit (3 parallel code-quality passes) before starting
`gamificationSystem.md`. Fixed: `findDuplicateTask.ts`'s real
"occasionally misses a duplicate" cause (one malformed entry throwing
blanked the whole announcement's results — changed to per-entry
fallback); consolidated 5 different, inconsistent `OLLAMA_URL`/model
configs (previously masked by everyone defaulting to the same address)
into `lib/ollamaConfig.ts`; moved gamification state to a DB-backed
`GamificationState` model (see Architecture Decisions); fixed
`getCanvasData()` to follow Canvas's pagination `Link` header (was
silently losing everything past page 1 for any course with 100+ items).

Deferred, not fixed (flagged as known/lower-severity):
`WeeklyPlannerView.tsx`'s size, the `getTaskPriority`/`calculatePriority`
divergence (deliberate), no automated tests, some lint warnings.

Verified: `tsc`/lint/build clean, a logged-out smoke test. No
login/Ollama-in-the-loop testing this session.

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

Large multi-round session: an app-wide audit/fix pass (bugs + theming
normalization across the web app and extension), then several rounds of
user feedback tightening the assignment cards and Pomodoro/Music Player
layout. Committed as `7f981d3` and `39d1fc1`.

- Real bugs fixed: a theme-flash race in `WeeklyPlannerView.tsx` (three
  competing sources of truth for `data-theme`), DST-unsafe day-diff math
  (new shared `daysBetween()`), a mismatched frog-score threshold, an
  unused `estimatedMinutes` priority input (now a tie-breaker), a
  `localhost:300` typo in the extension manifest, and
  `analyzeAssignment.ts` not following the repo's Ollama-fallback
  convention.
- `MusicPlayer.tsx` switched from viewport breakpoints to Tailwind v4
  container queries (it only ever renders at half window width) and
  `minmax(0, 1fr)` grid templates (bare `1fr` was causing page overflow).
- Assignment cards went through several compaction rounds per user
  feedback: dropped the due-date text, the "Completed late" badge, and
  the priority-label badge; moved focus/delete buttons to a hover-only
  overlay; tightened padding repeatedly.
- Added the due-*time* picker (`DueTimeField.tsx`) — see Architecture
  Decisions' "Due date/time" bullet.

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
