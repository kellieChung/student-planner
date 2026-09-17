PRIORITIZATION MODULE SPEC

Philosophy: based on "Eat That Frog" (Brian Tracy) — surface the
highest-priority/most-avoided task first, don't just sort by raw due date.

Core signal (v1, zero extra user friction):
- For every completed task, log when it became visible/was added and when
  it was marked done.
- Compute hours-before-deadline per completion, grouped by task type/
  subject.
- Build a rolling per-student average per type — a personalized
  "procrastination index," derived purely from data already collected.

Ranking logic:
- Urgency = time remaining until due, adjusted by the student's
  historical procrastination index for that task's type.
- A type the student historically leaves late surfaces sooner than raw
  due-date sorting would suggest, even if its deadline isn't nearest.
- No history yet for a type → falls back to plain deadline-proximity
  sorting until enough data accumulates.

Scoring formula — clarified 2026-09-05 after the first implementation got
this wrong (a due-in-10-days major project outscored a due-today reading
response, because importance/difficulty/consequence were weighted as
~50% of the score, additively, alongside urgency's 50%):

- **Urgency (procrastination-adjusted) is the dominant signal, full
  stop.** A task due today must never be outranked by a "more important"
  or "more difficult" task due next week.
- Importance/difficulty/consequence/the "frog" bonus (high importance
  *and* high difficulty) exist **only to break ties among tasks of
  similar urgency** — they must never carry enough combined weight to
  overcome a real urgency-tier difference.
- Concretely: rank primarily by the procrastination-adjusted urgency
  bucket; treat importance/difficulty/consequence/frog as a strictly
  smaller-magnitude tie-breaker within that bucket. Never go back to a
  flat weighted sum where the non-urgency terms can rival a one-bucket
  urgency swing.

Start-date gate (2026-09-14) — a gate, not a weight, so it does not
reopen the "Scoring formula" weighting above:

- A task with a custom start date in the future (TaskCustomization.startAt
  > today) cannot be worked on yet, so it must never be auto-selected as
  Up Next/the frog, regardless of how urgent its due date is. This forces
  the final score to 0 rather than adjusting the urgency/secondary
  weights.
- An overdue due date always wins over a stale future startAt (e.g. the
  due date moved earlier via Canvas ingest after startAt was set) — never
  hide something now overdue.
- Only affects automatic ranking (Up Next / lib/prioritization.ts's
  `score`). A user who explicitly focuses a not-yet-startable task (the
  per-task Focus toggle, "Focus in Pomodoro") keeps that choice — a
  direct user action, not auto-prioritization, out of scope for this gate.
- lib/prioritization.ts stays framework-free: callers resolve
  TaskCustomization/the expired-start-date auto-revert (see
  hasCustomStartDatePassed in lib/utils.ts) into a plain "YYYY-MM-DD"
  startAt/today pair before calling calculatePriority.

Output: a ranked task list (the "frog" — top priority — clearly
highlighted), re-sorted dynamically as new completions add data.

Future/optional (not v1):
- Opt-in one-tap post-completion effort estimate as a secondary signal.
- Opt-in gamified session timer tied to the gamification system, for
  real time-on-task data.

Do NOT build: mandatory active time-tracking, pause/resume timers, or
anything requiring the user to babysit a running clock — friction defeats
the purpose.

Time estimation (2026-09-05): `estimatedMinutes` used to be AI-guessed by
Ollama despite not even feeding the scoring formula above. Replaced with
`estimateMinutesByType()` (`lib/analyzeAssignment.ts`), the deterministic
"keyword estimation" placeholder this spec always called for. A
per-student historical estimator (actual completion time by type) is
still the intended real version — not built yet.

Automatic estimation scope (2026-09-06): auto-estimating an entire
150+-assignment backlog against local Ollama on every change measurably
heated up the machine. `selectTasksNeedingEstimates()`
(`lib/taskPlanning.ts`) now scopes each pass to tasks due within 3 weeks,
capped at 60 (soonest-due first). Tasks with no due date are never
auto-estimated — they simply show without an AI-derived priority score,
same as any task before its first estimate arrives.
