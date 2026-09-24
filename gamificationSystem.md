# Lodestar — Gamification Spec

This replaces the earlier medieval-kingdom gamification spec. The kingdom-builder concept, the pixel-art sourcing work, and the isekai mascot (Nano) have all been retired in favor of the system below. Nothing in this system depends on the old medieval assets — no building sprites, no pixel-art tileset, no mascot poses.

## Core concept

The player is a lone navigator charting an unmapped stretch of sky. This is a personal, exploratory frame — not commerce, not ownership. Completing real schoolwork generates **Starlight** (the in-game currency), which is spent to chart new stars and build out constellations. Constellations are the real IAU constellations (Orion, Cassiopeia, …), not tied to the player's classes. Over a semester, the sky fills in as a direct visual record of real effort — "how much of the sky have I mapped," never "how much of the sky do I own."

## Economy

- **Earning:** every completed task generates Starlight. Amount varies by task weight (a quick reading nets less than a big project or exam) — implemented as exactly the existing XP award (`app/api/task-xp`: estimated minutes → 10–100, with the late penalty), so XP and Starlight are earned together.
- **Spending:** Starlight is spent to chart individual stars and complete constellations. This is a deliberate player choice, not an automatic 1:1 mapping — part of the point is giving the player agency over which part of their sky to build out next, and it leaves room to add upgrades or new spendable items later without redesigning the core loop.
- **Constellations (decision, 2026-09-24):** the real IAU constellations, **not tied to classes**. They surface in a fixed sequence gated by **lifetime Starlight** (total ever earned, never reduced by spending): a few instantly recognisable ones first (Orion, the Big Dipper / Ursa Major, Cassiopeia — all open from 0) so early progress feels satisfying, then gradually more obscure ones as lifetime Starlight accumulates. The official 88 give a long runway; the first 15 ship now (`lib/constellations.ts`: thresholds 0, 0, 0, 150, 350, 600, … 5100), the rest are planned. Star price rises gently with position in the sequence (25 + 5 × index Starlight). Completing a full constellation is a genuine milestone moment, not something that happens incidentally — reserve the biggest visual payoffs (a constellation fully lighting up, a new region of sky unlocking) for real milestones (finishing a unit, surviving exam week, end of semester) rather than letting them trickle in from routine spending. Small, frequent Starlight spending should feel good in the moment; the big "whoa" moments should still feel earned, not routine.
- **Future extensibility:** because progress is currency-based rather than hardcoded to specific completions, later upgrades (special star types, cosmetic effects, new spendable categories) can slot into the same economy without restructuring it.

## The two views, and the story that connects them

**Planner view = the ship's log / instrument panel.** This is where the actual work happens — the daily/weekly task list, schedule, prioritization. Functional, calm, low-friction, matching the "utility screen stays simple" principle from earlier in this project. Closing out a day's tasks can read narratively as "logging the day's course" — a small satisfying beat, not just a checkbox tap.

**Galaxy view = the observation window / star chart.** This is the reward/big-picture screen — where Starlight gets spent, where constellations are viewed, where the player sees how far they've actually traveled. This is the emotionally rewarding side of the "utility vs. reward screen" split.

**Transition between them:** a gentle pull-back/zoom-out — the camera moving from a close-up on the instrument panel out through the observation window to the wide star field. This should read as "stepping back from the work to see your progress," not a jarring cut between two unrelated screens. Keep the reverse transition (going back into the planner) equally smooth — a push-in toward the console — so the two views feel like one continuous space, not two separate apps bolted together.

## No separate mascot character

The isekai/comedic mascot concept (Nano) is retired — it was built for the busy, whimsical medieval-kingdom world and doesn't fit Lodestar's calmer, more contemplative tone. Decision: **no illustrated companion character.** The player's own lodestar (their personal star, growing with real effort) is the emotional anchor — it doesn't need a face or a separate personality attached to it. Any encouragement/notification copy should have a warm, consistent voice through writing alone, without a character delivering it. This also meaningfully reduces production scope — no pose sheets, no character consistency to maintain across screens, no dialogue-writing burden.

## Feature naming (consistent vocabulary across the app)

| Concept | Name |
|---|---|
| In-game currency | Starlight |
| A real star cluster you chart with Starlight | Constellation |
| The single highest-priority task (Eat-the-Frog output) | Polaris |
| The daily/weekly task view | Ship's Log (or Instrument Panel) |
| The big-picture progress/reward view | Star Chart (or Observation Deck) |
| Unlockable cosmetic effects/skins | Nebula |
| The home/dashboard view | True North |

## Asset needs (much lighter than the old medieval system)

No bespoke building sprites, no growth-stage art per category, no mascot pose sheets. What's actually needed:
- A small set of star mark variants (point count/style, reusing the favicon exploration work) for different constellation states (unlit, partially charted, fully lit)
- A soft glow/twinkle effect (simple, reusable, not a static image per star — ideally a shared animation/shader applied to any star)
- Constellation connecting-line rendering (procedural, not hand-drawn per constellation)
- A small number of background treatments for the star chart (a base night-sky field, maybe a subtle nebula-cloud texture for depth)

This is inherently scalable without new art per level — solves the exact "running out of content" problem the old building-based system had to work around.