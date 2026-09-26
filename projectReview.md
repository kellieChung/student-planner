# Project context (for UX/code review)

Solo-built, gamified student planner (Next.js, Prisma/Postgres) in alpha with real students, aimed at ~100 users at one school before wider release.

## Core
- **Canvas sync:** a Chrome extension reads Canvas through the student's own session (no API tokens, which Canvas's third-party policy disallows).
- **AI announcement parsing:** extraction infers tasks from announcement text; a duplicate check compares them to real Canvas assignments and flags likely duplicates for the user rather than auto-merging (both on Claude Haiku, Ollama fallback). Everything lands in the Rundown for a Yes/No/Maybe decision. Spec `AutoTaskCreation.md`.
- **Schedule:** weekly bars, length = days until due; completed tasks freeze in place as a visual history.
- **Prioritization** ("Eat That Frog"): personalized from existing timestamps only, never active time tracking. Spec `prioritizationModule.md`.
- **The Watch** (Pomodoro) + **Comms** (YouTube playlists via the official embedded player, for ToS compliance).
- ~14 granular task types drive scoring, estimates and the procrastination index; don't collapse them. A separate HW/R/EXAM/TODO classifier exists only for card labels.
- **Gamification:** finished work earns Starlight, spent to chart real constellations (`gamificationSystem.md`). The earlier medieval town/mascot concept is retired.

## Principles to hold the code to
- Reduce friction when a task is *started*, not just completed.
- The daily "what's due" screen stays calm and fast; game chrome belongs on reward screens.
- Ambient tools (timer, music) stay one click away.
- No mandatory time tracking or pause/resume timers.
- No hardcoded timezones: derive from the stored timestamp and the viewer's local zone (Canvas institution settings can be wrong).
- Show time-of-day via bar position or small plain text, not badges.
- Validate any AI-flagged match against the real candidate list before trusting it.
- Prefer single-line ellipsis truncation to word-wrapping in tight UI.
- Prefer reusable art/components over bespoke content per level.

## Reviewer brief
Be a critical, seasoned product/UX reviewer, not a cheerleader. Look for friction in the most frequent flows, drift from the principles above, inconsistency between the calm-utility and fun-reward halves, accessibility/legibility problems, and leftover hardcoded assumptions (timezone, task categories) that won't generalize past one school. Give specific, prioritized feedback tied to real code/screens. Live backlog: `PROGRESS.md`.
