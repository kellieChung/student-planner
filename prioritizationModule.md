# Prioritization spec

Based on "Eat That Frog": surface the highest-priority, most-avoided task, not just the earliest due date. Implementation: `lib/prioritization.ts` (framework-free).

## Signal (zero extra user friction)
For each completed task, log when it became visible and when it was done; compute hours-before-deadline per completion, grouped by task type. A rolling per-student average per type is the "procrastination index" (`lib/procrastinationHistory.ts`). A type the student habitually leaves late is treated as due sooner. No history for a type falls back to plain deadline proximity.

## Scoring rules (fixed 2026-09-05 after a due-in-10-days project outscored a due-today reading; reworked 2026-10-04)
- **Least slack wins.** Slack = hours until the due moment (time of day included), minus estimated work time, minus the procrastination shift. So it's the latest time you could start. It's clamped to a finite range (overdue floor −24h, undated/far = 90 days). A task due today must never lose to a "more important" or harder task due next week.
- Importance, difficulty, consequence and the "frog" bonus (high importance *and* difficulty) only break ties. Together they're worth at most 6 hours of slack (`MAX_TIE_BREAK_HOURS`), so they never beat a day's difference in deadline. Effort counts through slack, not as a bonus. Never return to a flat weighted sum or coarse urgency buckets (they tied Mon/Tue tasks and let a bad estimate decide).
- **Start-date gate (2026-09-14):** a task with a future custom start date (`TaskCustomization.startAt > today`) gets score 0, so it is never auto-selected as Up Next/frog. It is a gate, not a weight. An overdue due date beats a stale future `startAt`. Explicitly focusing such a task (Focus toggle) is a user action and stays allowed. Callers resolve start dates (incl. `hasCustomStartDatePassed`) into plain `"YYYY-MM-DD"` before calling the module.

Output: Polaris (the frog) plus a "Then" list of the next 4 tasks, re-ranked as data accrues.

## Estimates
`estimatedMinutes` comes from `estimateMinutesByType()` (`lib/assignmentType.ts`), a deterministic type→minutes lookup, so **the type is what matters**. Type precedence (`resolveAssignmentType`): Canvas's own `submission_types` (`typeFromSubmissionTypes`: `discussion_topic` → discussion, `online_quiz` → quiz, or exam if the name says midterm/final/exam), then the name keyword when the AI said `other` or the keyword is the smaller estimate, then the AI.

**No-AI gate (2026-10-04, cost):** the client sends only open tasks that aren't past due and are due within 10 days (`selectTasksNeedingEstimates`, max 60). The server types each from the DB (Canvas type, else a confident name keyword incl. a leading "DISCUSS:"). Those get `scoresForType` scores, nudged by points vs the course median (`adjustScoresForPoints`), and are stored with `DETERMINISTIC_ANALYSIS_REASON`, with no AI call and not counted toward the daily cap. Only the rest go to Haiku as one line each (`N. name | course | pts`) with short output keys (`i,t,imp,dif`; consequence comes from the type table). Unestimated tasks still rank and record procrastination history using their deterministic type.

Rejected: prompt caching (the prompt is ~1.1k tokens, under Haiku 4.5's 4,096-token minimum, so it silently doesn't cache) and the Batch API (50% off but async; not worth the polling infrastructure at ~$0.002 per call). Sending descriptions was also left off for cost.

## Not v1
Opt-in one-tap post-completion effort estimate; opt-in gamified session timer. **Do not build** mandatory active time tracking, pause/resume timers, or anything needing a babysat clock.
