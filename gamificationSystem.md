# Lodestar — gamification spec (Star Chart)

Replaces the retired medieval-kingdom system (town, buildings, pixel sprites, isekai mascot Nano). Nothing here depends on those assets; the old code stays in the repo, marked RETIRED.

## Concept
The player is a lone navigator charting an unmapped sky: exploration, not ownership. Finished schoolwork earns **Starlight**, spent to chart stars in **real IAU constellations** (not tied to classes). The sky becomes a visual record of real effort: "how much have I mapped", never "how much do I own".

## Economy
- **Earn:** every completed task earns Starlight equal to its XP award (`app/api/task-xp`: estimated minutes → 10–100, with a late penalty), so XP and Starlight rise together.
- **Spend:** a deliberate player choice to chart individual stars, with room for future upgrades or spendable categories.
- **Unlocks:** constellations appear in a fixed order gated by **lifetime Starlight** (never reduced by spending). Orion, the Big Dipper and Cassiopeia are open from 0, then more obscure ones as it grows. 15 of 88 ship (`lib/constellations.ts`, thresholds 0, 0, 0, 150, 350, 600 … 5100); the rest are planned. Star price = 25 + 5 × index.
- Reserve the big payoffs (a fully lit constellation, a new region of sky) for real milestones; routine spending should feel good but small.

## Two views
- **Ship's Log** (planner): the calm, low-friction working screen; closing a day reads as "logging the day's course".
- **Star Chart:** the reward/big-picture screen where Starlight is spent and constellations viewed.
- The switch is a pull-back/zoom-out and a matching push-in, so it feels like one space.

## No mascot
No illustrated companion. The player's own star is the emotional anchor; encouragement copy has a warm, consistent written voice only.

## Vocabulary
Starlight (currency) · Constellation · **Polaris** (top-priority task) · **Ship's Log** (planner) · **Star Chart** (progress view) · **Nebula** (future cosmetics) · **True North** (home) · **The Watch** (focus timer) · **Comms** (music).

## Onboarding
A spotlight tour over the real UI (`components/starchart/Onboarding.tsx`) teaches this vocabulary, how to read a task label (`COURSE - TYPE - DAY - name`, e.g. `MA - HW - F - Problem set 4`), and why the Chrome extension is needed. Replay from settings → "Replay intro" or `/dev/onboarding`.

## Assets
Light by design: a few star-mark variants (unlit / partial / lit), a shared glow/twinkle effect, procedural constellation lines, and a night-sky field. No per-level bespoke art.
