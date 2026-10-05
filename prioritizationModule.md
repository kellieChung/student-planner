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
`estimatedMinutes` comes from `estimateMinutesByType()` (`lib/assignmentType.ts`), a deterministic type→minutes lookup. The type is `resolveAssignmentType(aiType, task)`: the task-name keyword type overrides the AI only when the AI said `other` or the keyword type is the smaller estimate (the AI once typed a discussion as an essay, 30 → 120 min). A per-student estimator from actual completion times is the intended future version. Auto-estimation (`selectTasksNeedingEstimates`, `lib/taskPlanning.ts`) covers tasks due within 3 weeks, max 60, soonest first; undated tasks are never auto-estimated.

## Not v1
Opt-in one-tap post-completion effort estimate; opt-in gamified session timer. **Do not build** mandatory active time tracking, pause/resume timers, or anything needing a babysat clock.
