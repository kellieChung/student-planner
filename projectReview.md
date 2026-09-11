# Project Context — For UX/Code Review

## What this is
A gamified student planner web app (Prisma/Postgres backend, likely Next.js on Vercel). Built solo, currently in active development, aimed at real use by ~100 students at a small school before wider release.

## Core functionality
- **Canvas sync:** A Chrome extension scrapes Canvas data from the student's own authenticated session (intentionally avoids requiring institutional/personal API tokens, which violates Canvas's third-party API policy).
- **AI announcement parsing (two-stage):** (1) extraction — infers tasks from unstructured announcement text that teachers don't put in the formal Assignments tab; (2) duplicate-check — compares inferred tasks against existing Canvas assignments, flags likely duplicates for user confirmation rather than auto-merging. Extraction runs on Claude Haiku via API; duplicate-check has been running on local Ollama and has shown real reliability issues (hallucinated assignment IDs not in the candidate list).
- **Schedule view:** Each task is a horizontal bar; length represents days until due, starting today; freezes in place once completed, building a visual completion history over time.
- **Prioritization ("Eat That Frog" based):** Personalization signal is derived from existing timestamps only (task-visible time vs. completion time) to build a per-student, per-task-type "procrastination index" — deliberately NOT based on active time-tracking, to avoid friction from pause/resume timers.
- **Pomodoro timer + music player** (YouTube playlist import — should use YouTube's official embedded IFrame player, not stream-ripping, for ToS compliance).
- **Task type taxonomy:** underlying system has ~14 granular types (homework/reading/quiz/exam/essay/etc.) that drive priority scoring, time estimates, and the procrastination index — this deeper system should NOT be collapsed for UI purposes. A separate simplified HW/R/EXAM/TODO classifier exists purely for card display labels.

## Gamification layer (in progress)
- Medieval town-builder aesthetic: village → town → city → kingdom, growth tied to task completion.
- Buildings tied to task categories: Library (R), Workshop (HW), Training Grounds (EXAM); behavior-based: Watchtower (on-time streak), Town Square (general activity/overall stage).
- Mascot: a modern tech assistant reincarnated into this medieval world (isekai trope, comedic anachronism), functions as in-character narrator for AI features and appears specifically when a student starts a task (not just completes one).
- Structural split: pixel-art "World" (mascot, town) vs. a clean/polished "OS" interior inside a visibly scuffed/broken laptop, which houses the actual productivity tools (schedule, Pomodoro, music, prioritization view). Laptop stickers are cosmetic customization from the same reward economy as town decorations.

## Design principles established so far (hold implementation accountable to these)
- Reduce friction at the moment a task is **started**, not just at completion — this is the actual psychological bottleneck for procrastination-prone users.
- The high-frequency "what's due" screen should stay calm and fast; reserve full game/world chrome for reward and customization screens, not the core daily-use flow.
- Ambient tools (Pomodoro, music) should be persistently/easily accessible, not buried behind multiple nested UI layers or a full "open app inside app" flow.
- No mandatory active-time tracking or pause/resume timers — friction defeats the purpose.
- No hardcoded timezones anywhere — always derive from the real stored timestamp and the viewer's own local timezone; account/institution-level Canvas timezone settings can be wrong or mismatched from the school's actual location.
- Time-of-day should be encoded visually (e.g., bar endpoint position) or shown as plain small metadata text, not a badge/chip — badges don't scale well when due times vary a lot across schools.
- Any AI-flagged match/duplicate must be validated against the real candidate ID list before being trusted — don't let a hallucinated reference silently persist.
- Prefer single-line truncation (ellipsis) over word-wrapping in space-constrained UI elements — awkward one-word-per-line wrapping has been a recurring visible bug.
- Prefer modular/reusable art assets over bespoke content per level/stage, to avoid content-scaling problems as engagement grows.

## Known recent bugs/issues
- Timezone handling was hardcoded to Eastern regardless of school/student location — needs full audit for any remaining hardcoded assumptions.
- A batch AI call timeout previously triggered an expensive full-fallback-to-individual-calls retry cascade — check whether the fix (smaller batches / smarter retry / longer timeout) is fully in place.
- Duplicate-check step has hallucinated nonexistent assignment IDs — needs a validation layer.
- Card layout in the weekly schedule view has shown text-wrapping/legibility issues in narrow columns.

## What to do
Act as a critical, seasoned product/UX reviewer — not a cheerleader. Actively look for: friction in the most frequent user flows, places where implementation drifts from the design principles above, inconsistency between the "calm utility" and "fun reward" halves of the UI, accessibility/legibility issues, and any leftover hardcoded assumptions (timezone, task categories, etc.) that won't generalize past this one school. Give specific, prioritized, concrete feedback tied to actual code/screens — not generic praise or vague suggestions.