PRIORITIZATION MODULE SPEC

Philosophy: Based on "Eat That Frog" (Brian Tracy) — surface the highest-priority/most-avoided task first, don't just sort by raw due date.

Core signal (v1, zero extra user friction):
- For every completed task, log two existing timestamps: (a) when the task became visible/was added to the planner, (b) when it was marked done.
- Compute "days/hours before deadline" for each completion, grouped by task type/subject (e.g. "math problem sets," "essays," "readings").
- Build a rolling per-student average: how early or late this student typically finishes each task type relative to its due date. This is a personalized "procrastination index" per category — requires no timers, no active tracking, purely derived from data already collected.

Ranking logic:
- For each open task, compute urgency = (time remaining until due) adjusted by the student's historical procrastination index for that task's type/subject.
- A task type the student historically leaves late should surface higher in the list sooner than raw due-date sorting would suggest, even if its deadline isn't the nearest.
- Tasks with no history yet for their type fall back to plain deadline-proximity sorting until enough data accumulates.

Scoring formula — clarified 2026-09-05 after the first implementation got
this wrong (a due-in-10-days major project was outscoring a due-today
reading response because importance/difficulty/consequence were weighted
as ~50% of the score, additively, alongside urgency's 50%):

- **Urgency (adjusted by procrastination history) is the dominant signal,
  full stop.** A task due today must not be outranked by a task due next
  week just because it's rated more "important" or "difficult" by the AI
  analysis. This is the whole point of the "Eat That Frog" framing: pick the
  worst task among what's actually due soon, don't let a shiny distant
  project jump the queue.
- Importance / difficulty / consequence / the "frog" bonus (high importance
  *and* high difficulty) exist **only to break ties among tasks of similar
  urgency** — e.g. two things both due this week, or two things both
  overdue. They must never carry enough combined weight to overcome a real
  difference in urgency tier.
- Concretely: rank primarily by the (procrastination-adjusted) urgency
  bucket; use importance/difficulty/consequence/frog only as a secondary,
  strictly-smaller-magnitude tie-breaker within that bucket. Do not go back
  to a flat weighted sum where the non-urgency terms can add up to
  something comparable to a one-bucket urgency swing — that's the exact bug
  that got fixed.

Output: a ranked task list (the "frog" — top priority — clearly highlighted), re-sorted dynamically as new completions add data.

Future/optional (not v1): 
- Opt-in one-tap post-completion effort estimate (<15min/15-30/30-60/1-2hr/2hr+) as a secondary signal.
- Opt-in gamified session timer ("start quest"/"end quest") tied to the gamification system, for actual time-on-task data.

Time estimation (2026-09-05): `estimatedMinutes` used to be AI-guessed by
Ollama, but it wasn't even used in the scoring formula above and was
wasting a full field's worth of prompt/output on every call. Replaced with
`estimateMinutesByType()` (`lib/analyzeAssignment.ts`) — a deterministic
type→minutes lookup, i.e. the "keyword estimation" placeholder this file
already called for. A per-student historical estimator (actual completion
time by type, once tracked) is still the intended real version of this —
not built yet.

Do NOT build: mandatory active time-tracking, pause/resume timers, or anything requiring the user to babysit a running clock — friction defeats the purpose.

Automatic estimation scope (2026-09-06): auto-estimating an entire backlog
(150+ assignments) against local Ollama, every time anything changed,
measurably heated up the machine. `selectTasksNeedingEstimates()`
(`lib/taskPlanning.ts`) now scopes each automatic pass to tasks due within
3 weeks, hard-capped at 60 per pass (soonest-due first if still over).
**Tasks with no due date are never auto-estimated at all** — there's no
date to window or rank them by, so they simply show without an AI-derived
priority score (same as any task before its first estimate arrives; the
rest of the app — `computeTaskPriority`, `getTaskPriority` — already
degrades gracefully with sensible defaults when no estimate exists yet).