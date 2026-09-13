# Project Context — For UX/Code Review

## What this is
A gamified student planner web app (Prisma/Postgres, Next.js). Built
solo, currently in active development, aimed at real use by ~100
students at a small school before wider release.

## Core functionality
- **Canvas sync:** A Chrome extension scrapes Canvas data from the
  student's own authenticated session (avoids requiring institutional/
  personal API tokens, which violates Canvas's third-party API policy).
- **AI announcement parsing (two-stage):** extraction infers tasks from
  unstructured announcement text; duplicate-check compares inferred
  tasks against existing Canvas assignments, flags likely duplicates for
  user confirmation rather than auto-merging. Extraction runs on Claude
  Haiku via API; duplicate-check runs on local Ollama.
- **Schedule view:** each task is a horizontal bar, length = days until
  due; freezes in place once completed, building a visual completion
  history over time.
- **Prioritization ("Eat That Frog" based):** personalization derived
  from existing timestamps only (task-visible time vs. completion time)
  — deliberately not active time-tracking, to avoid pause/resume-timer
  friction.
- **Pomodoro timer + music player** (YouTube playlist import via the
  official embedded IFrame player, not stream-ripping, for ToS
  compliance).
- **Task type taxonomy:** ~14 granular types (homework/reading/quiz/
  exam/essay/etc.) drive priority scoring, time estimates, and the
  procrastination index — this deeper system should NOT be collapsed for
  UI purposes. A separate simplified HW/R/EXAM/TODO classifier exists
  purely for card display labels.

## Gamification layer
- Medieval town-builder aesthetic: village → town → city → kingdom,
  growth tied to task completion.
- Buildings tied to task categories: Library (R), Workshop (HW),
  Training Grounds (EXAM); behavior-based: Watchtower (on-time streak),
  Town Square (general activity/overall stage).
- Mascot: a modern tech assistant reincarnated into this medieval world
  (isekai trope, comedic anachronism), in-character narrator for AI
  features, appears when a student starts a task (not just completes one).
- Structural split: pixel-art "World" (mascot, town) vs. a clean/
  polished "OS" interior inside a visibly scuffed/broken laptop, which
  houses the actual productivity tools. Laptop stickers are cosmetic
  customization from the same reward economy as town decorations.
- Full spec: `gamificationSystem.md`. Build status/decisions:
  `PROGRESS.md`.

## Design principles established so far (hold implementation accountable to these)
- Reduce friction at the moment a task is **started**, not just at
  completion — the actual psychological bottleneck for procrastination-
  prone users.
- The high-frequency "what's due" screen should stay calm and fast;
  reserve full game/world chrome for reward/customization screens, not
  the core daily-use flow.
- Ambient tools (Pomodoro, music) should be persistently/easily
  accessible, not buried behind nested UI layers or a full "open app
  inside app" flow.
- No mandatory active-time tracking or pause/resume timers.
- No hardcoded timezones anywhere — always derive from the stored
  timestamp and the viewer's own local timezone; institution-level
  Canvas timezone settings can be wrong or mismatched from the school's
  actual location.
- Time-of-day should be encoded visually (e.g. bar endpoint position) or
  shown as plain small metadata text, not a badge/chip — badges don't
  scale well when due times vary a lot across schools.
- Any AI-flagged match/duplicate must be validated against the real
  candidate ID list before being trusted — don't let a hallucinated
  reference silently persist.
- Prefer single-line truncation (ellipsis) over word-wrapping in
  space-constrained UI — awkward one-word-per-line wrapping has been a
  recurring visible bug.
- Prefer modular/reusable art assets over bespoke content per level/
  stage, to avoid content-scaling problems as engagement grows.

## Known issues
This section's original list (hardcoded Eastern-timezone assumption, a
batch-timeout retry cascade, hallucinated duplicate-check assignment
IDs, card text-wrapping in narrow columns) has since been fixed — see
`PROGRESS.md`'s Architecture Decisions. For the current, live backlog of
known gaps and unverified items, see `PROGRESS.md`'s **Active TODOs**
section instead of this file.

## What to do
Act as a critical, seasoned product/UX reviewer — not a cheerleader.
Actively look for: friction in the most frequent user flows, places
where implementation drifts from the design principles above,
inconsistency between the "calm utility" and "fun reward" halves of the
UI, accessibility/legibility issues, and any leftover hardcoded
assumptions (timezone, task categories, etc.) that won't generalize past
this one school. Give specific, prioritized, concrete feedback tied to
actual code/screens — not generic praise or vague suggestions.
