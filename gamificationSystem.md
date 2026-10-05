# Lodestar — gamification spec (Star Chart)

Replaces the retired medieval-kingdom system (town, buildings, pixel sprites, isekai mascot Nano). Nothing here depends on those assets; the old code stays in the repo, marked RETIRED.

## Concept
The player is a lone navigator charting an unmapped sky: exploration, not ownership. Finished schoolwork earns **Starlight**, spent to chart stars in **real IAU constellations** (not tied to classes). The sky becomes a visual record of real effort: "how much have I mapped", never "how much do I own".

## Economy
- **Earn:** every completed task earns XP (`lib/xp.ts`, server-side by the AI's stored task type: 15 small / 25 standard / 40 big, with a late penalty; never from the editable time estimate) and Starlight = 0.4 × that XP (`starlightForXp`: 6 / 10 / 16). Rebalanced 2026-10-04 from Starlight = XP, which made a star cost about one task.
- **Canvas catch-up:** Canvas auto-completions pay Starlight only for a submission within the last 8 days (XP always), so turning complete-from-Canvas on, or the first check, doesn't dump Starlight for every past submission. Custom tasks earn normally; a 30/day cap was tried and removed (2026-10-04, user: exploiting it isn't a big deal).
- **Spend:** a deliberate player choice to chart individual stars, with room for future upgrades or spendable categories. Star price = (20 + 6 × catalog index, levelling off at index 14) × magnitude (bright 1.5× / mid 1× / faint 0.75×), rounded to 5. Bright named stars cost more, so there's a choice between the showpiece and a few dim stars. Home sky ≈ 7,000 Starlight ≈ 775 tasks (most of a school year); first stars take ~2 tasks, late bright ones ~15.
- **Unlocks:** constellations appear in a fixed order gated by **lifetime Starlight** (never reduced by spending). Orion, the Big Dipper and Cassiopeia are open from 0, then more obscure ones as it grows (`lib/constellations.ts`, home thresholds 0, 0, 0, 180, 420 … 6120). A constellation the student has already charted a star in stays visible even if its threshold is later raised (`isVisible`).
- **Regions / expansions:** the sky is split into regions (`SKY_REGIONS`). The home sky (15) is free. **The Southern Sky** (12: Canis Major, Sagittarius, Centaurus, Carina, Vela, Lupus, Corona Australis, Grus, Pavo, Phoenix, Triangulum Australe, Tucana) is bought for 750 Starlight once lifetime reaches 6120 (every home constellation discovered). Bought regions are stored in `StarChart.unlockedRegions`. Three appear at purchase, then one every 700 lifetime. 27 of 88 ship; later regions follow the same pattern.
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
A spotlight tour over the real UI (`components/starchart/Onboarding.tsx`) teaches this vocabulary, how to read a task label (`COURSE - TYPE - DAY - name`, e.g. `MA - HW - F - Problem set 4`), why the Chrome extension is needed, how to finish a task (status circle / Mark done, Canvas auto-complete), the Rundown's manual checks and Still deciding, what lives under Settings, and that new sky regions can be unlocked. Replay from settings → "Replay intro" or `/dev/onboarding`. After the tour, a student with no Canvas course sees a "Connect Canvas" notice in the Ship's Log (its "How to install" button replays the tour).

## Assets
Light by design: a few star-mark variants (unlit / partial / lit), a shared glow/twinkle effect, procedural constellation lines, and a night-sky field. No per-level bespoke art.
