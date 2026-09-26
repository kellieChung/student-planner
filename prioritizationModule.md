# Prioritization spec

Based on "Eat That Frog": surface the highest-priority, most-avoided task, not just the earliest due date. Implementation: `lib/prioritization.ts` (framework-free).

## Signal (zero extra user friction)
For each completed task, log when it became visible and when it was done; compute hours-before-deadline per completion, grouped by task type. A rolling per-student average per type is the "procrastination index" (`lib/procrastinationHistory.ts`). A type the student habitually leaves late is treated as due sooner. No history for a type falls back to plain deadline proximity.

## Scoring rules (fixed 2026-09-05 after a due-in-10-days project outscored a due-today reading)
- **Procrastination-adjusted urgency dominates.** A task due today must never lose to a "more important" or harder task due next week.
- Importance, difficulty, consequence and the "frog" bonus (high importance *and* difficulty) only break ties within similar urgency; they must never carry enough weight to beat one urgency bucket. Never return to a flat weighted sum.
- **Start-date gate (2026-09-14):** a task with a future custom start date (`TaskCustomization.startAt > today`) gets score 0, so it is never auto-selected as Up Next/frog. It is a gate, not a weight. An overdue due date beats a stale future `startAt`. Explicitly focusing such a task (Focus toggle) is a user action and stays allowed. Callers resolve start dates (incl. `hasCustomStartDatePassed`) into plain `"YYYY-MM-DD"` before calling the module.

Output: a ranked list with the frog clearly highlighted, re-ranked as data accrues.

## Estimates
`estimatedMinutes` comes from `estimateMinutesByType()` (`lib/analyzeAssignment.ts`), a deterministic type→minutes lookup. A per-student estimator from actual completion times is the intended future version. Auto-estimation (`selectTasksNeedingEstimates`, `lib/taskPlanning.ts`) covers tasks due within 3 weeks, max 60, soonest first; undated tasks are never auto-estimated.

## Not v1
Opt-in one-tap post-completion effort estimate; opt-in gamified session timer. **Do not build** mandatory active time tracking, pause/resume timers, or anything needing a babysat clock.
