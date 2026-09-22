# Gamification System Spec

## Overview

The planner is framed as a medieval kingdom-builder. Completing real
schoolwork grows a visual town into a kingdom over a semester/school
year. A mascot — a modern tech assistant accidentally reincarnated into
this medieval world — narrates the experience and lives inside a
broken/scuffed laptop that serves as the actual functional planner
interface.

Two visually distinct modes:
- **Outside the laptop (the World):** pixel art, RPG/medieval aesthetic,
  the growing town/kingdom, the mascot's character form.
- **Inside the laptop (the OS):** clean, modern, polished productivity
  UI — the actual task list, schedule bars, Pomodoro timer, and
  prioritization view. Framed as "tech from another world" the mascot
  brought with it.

(Status: built and shipped — see `PROGRESS.md`'s "Gamification / World
layer" architecture decisions for what actually landed and what's still
deferred.)

---

## Core Mechanic: Task Completion → Town Growth

Growth is **typed**, not generic — the *category* of task completed
determines *which* building/feature grows, not just an abstract point
total. The town's overall stage (village → town → kingdom) advances on
cumulative growth across all categories combined.

Actual task-type taxonomy used by the app: **HW**, **R** (reading), **EXAM**.

| Task Type | Building/Feature | Growth Flavor |
|---|---|---|
| **R** (reading) | **Library** | Shelves fill in, new wings, a reading nook |
| **HW** | **Workshop / Forge** | Tools, gears, machinery upgrade |
| **EXAM** | **Training Grounds / Arena** | Banners, trophy racks accumulate |

Behavior-based (track *how* the student works, not *what* they completed):

| Signal | Building/Feature | Growth Flavor |
|---|---|---|
| On-time completion streak | **Watchtower** | Height/detail increases with consistency |
| General activity / overall progress | **Market / Town Square** | Stalls, decorations, NPCs; also the stage-progression anchor |

If more task types get added (projects, presentations, group work), new
buildings can slot in the same way — Castle/Keep, Amphitheater, Guild
Hall are natural options, not needed for the current 3-category taxonomy.

---

## Progression Structure

- Stages: Village → Town → City → Kingdom (~4-5 major visual stages).
  Thresholds scale up per stage so highly active users don't exhaust
  content instantly, roughly mapping to a semester/school year.
- Major visual jumps (kingdom-wide stage changes) are milestone-gated, not
  raw-task-count-live: day-to-day completions feed *incremental*
  per-building growth immediately, but the persisted kingdom-wide stage
  only advances at a checkpoint (currently every 5th completed task),
  jumping straight to whatever stage is eligible. See `PROGRESS.md`'s
  "Kingdom-wide stage is milestone-gated" note for the exact mechanism.

---

## The Mascot

- **Concept:** A modern tech assistant (AI/device) pulled into this
  medieval world through unexplained means — exists partly as a
  character in the world, partly as the laptop's "spirit."
- **Voice:** Plays the isekai "you have been reincarnated as—" trope
  straight, with comedic anachronism — modern tech concepts (Wi-Fi,
  notifications) treated as lost magic or common knowledge nobody else
  understands.
- **Function, not just flavor:** narrates AI-parsed announcement
  discoveries in character; appears when a student **starts** a task
  (not just completes one) to reduce activation friction; serves as
  onboarding guide and the app's "face"; same character in two forms
  (robed figure in the world, "OS voice" inside the laptop). Named
  **Nano** in the actual build.

---

## The Laptop

- **Appearance:** Visibly broken/scuffed (cracked corner, wonky hinge,
  worn stickers) — cosmetic only, must never imply real unreliability.
- **Function:** The literal container for the real productivity UI —
  task list, schedule bar view, Pomodoro timer, music player,
  prioritization view — deliberately contrasting with the pixel-art
  world outside.
- **Transition:** A lid-open/lid-close animation between "World" and "OS".
- **Customization — Stickers:** Earned through the same reward economy
  as town-building. Purely cosmetic (stickers, case colors, small
  cosmetic repairs). **Not yet built** — deferred, per Active TODOs.
  Build as a small set of modular, combinable assets (a handful of
  sticker designs, a few case colors) rather than many bespoke skins.

---

## Reskinned Tools (in-world flavor text, real functionality underneath)

| Real Feature | In-World Framing | Status |
|---|---|---|
| Pomodoro timer | "Ancient time magic" / hourglass ritual | Shipped |
| Music player | Bard's enchanted lute; imports = "songs collected from traveling minstrels" | Shipped |
| Schedule / bar-chart view | The kingdom's road map — each bar a path to its due date; completed = paved road | Not reskinned |
| Customization/shop | Royal treasury and market stalls | Not built |
| Notifications/reminders | Royal decrees or scout reports | Not reskinned |
| AI announcement parsing | Scrying / divination | Not reskinned |

---

## Reward Economy

Single currency earned through real productive behavior (task
completion, on-time finishing per the personalized timing signal,
consistent usage) — not arbitrary login streaks disconnected from actual
schoolwork. Spendable on town decorations, building cosmetics, laptop
stickers/case cosmetics (shop UI not yet built). **The streak/grace-token
mechanic described in earlier drafts of this doc was built, then removed
entirely** (per explicit user instruction — "goes against the principles
of the game," see `PROGRESS.md`). Currency/growth now come from a flat
on-time-completion bonus with no consecutive-day tracking; don't
reintroduce streak mechanics without re-litigating with the user first.

---

## Image Asset Specification

Town/building art is sourced (see below) and **fully wired in** — real
sprite art renders for every building stage (`Building.tsx`, driven by
`WorldLayoutData.buildingStageSprites`, not a static constant);
`PixelBlock` (colored divs + emoji/label) is gone from building rendering,
still used for a couple of decorations with no sprite equivalent. The
World map itself is now user-designed data, hand-edited via `/dev/map-
editor` (a real in-app tool: sprite picker, drag-to-place, pan/zoom
preview) rather than hardcoded terrain arrays — see `PROGRESS.md`'s
"Gamification / World layer" section for the full design and gotchas
before touching map-rendering code.

**Style guide:** pixel art, 16-bit/SNES-RPG era (Stardew Valley
proportions, not 8-bit NES chunkiness). Base tile/sprite unit is the
sourced pack's native 16×16px, rendered at an integer scale (2x, i.e.
effectively 32px on screen) via `components/world/TileSprite.tsx` — see
`lib/spriteSheet.ts`/`lib/spriteMap.ts`. Limited, warm,
muted medieval palette (parchment beige, forest green, brick red/
terracotta, slate blue, weathered wood brown) — reuse the same ~12-16
colors across every asset. Consistent 1px dark outline. Transparent PNG
background on all sprites/icons.

**Asset list:**
- *Mascot (world form):* idle, talking/gesturing, celebrating, and a
  small "confused/glitching" comedic pose.
- *Mascot (OS form):* a simple icon/avatar for the laptop UI's "voice"
  (doesn't need a full sprite).
- *Town, 2-4 growth-stage variants each (empty plot → basic → upgraded):*
  Library (R), Workshop/Forge (HW), Training Grounds/Arena (EXAM),
  Watchtower (streak), Market/Town Square (overall stage anchor).
- *Terrain:* grass base tile, dirt path, stone/plaza tile, a few
  decorative filler sprites (trees, fences, lanterns).
- *The Laptop:* closed-lid sprite (scuffed details), open-lid sprite,
  4-6 sticker overlay designs, 2-3 alternate case-color recolors.
- *UI icons (~16-24px, flatter than world sprites):* clock, lute/note,
  scroll, coin/crown, book, quill, hammer/gear.

**Sourcing:** town/building/terrain/road tiles come from Toen's Medieval
Strategy Sprite Pack (`public/tiles/toen-medieval-strategy.png`, a 7x52
grid of 16×16 tiles), **CC-BY 4.0** — unlike Kenney's CC0 packs, this
requires attribution, which lives on `/credits` (linked from the Taskbar's
⚙️ menu). Don't add a new asset under this attribution requirement without
also adding it to that page. The mascot itself still needs a custom design
(it's the app's unique character); generic building/terrain/road tiles are
covered by the sourced pack.
