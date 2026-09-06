# Gamification System Spec

## Overview

The planner is framed as a medieval kingdom-builder. Completing real schoolwork grows a visual town into a kingdom over the course of a semester/school year. A mascot — a modern tech assistant accidentally reincarnated into this medieval world — narrates the experience and lives inside a broken/scuffed laptop that serves as the actual functional planner interface.

Two visually distinct modes:
- **Outside the laptop (the World):** pixel art, RPG/medieval aesthetic, the growing town/kingdom, the mascot's character form.
- **Inside the laptop (the OS):** clean, modern, polished productivity UI — this is where the actual task list, schedule bars, Pomodoro timer, and prioritization view live. Framed as "tech from another world" that the mascot brought with it.

---

## Core Mechanic: Task Completion → Town Growth

- Every completed task contributes growth to the town.
- Growth is **typed**, not generic — the *category* of task completed determines *which* building or town feature grows, not just an abstract point total.
- The town's overall visual stage (village → town → kingdom) advances based on cumulative growth across all categories combined.

### Task Type → Building Mapping (example set)

| Task Type | Building/Feature | Growth Flavor |
|---|---|---|
| Reading assignments | **Library** | Shelves fill in, new wings added, a reading nook appears |
| Writing assignments (essays, papers) | **Scriptorium / Town Hall** | Scrolls and banners accumulate, a printing press or scribe's desk appears |
| Problem sets / math & science homework | **Workshop / Forge** | Tools, gears, and machinery visibly upgrade |
| Projects (multi-day, larger tasks) | **Castle / Keep** | Wings, towers, or fortifications added as big projects finish |
| Exams / tests | **Training Grounds / Arena** | Banners of victories, trophy racks |
| Presentations | **Amphitheater / Bard's Stage** | Seating expands, stage decorations added |
| Group projects | **Guild Hall** | Multiple flags/crests representing collaborators |
| On-time completion streak (personalized timing signal) | **Watchtower** | Height/detail increases with consistency |
| General day-to-day activity / login consistency | **Market / Town Square** | Stalls, decorations, NPC villagers appear |

*(This table is a starting point — exact categories should map to whatever task-type taxonomy the AI announcement-parser and Canvas sync already use.)*

---

## Progression Structure

- **Stages:** Village → Town → City → Kingdom (roughly 4-5 major visual stages).
- **Thresholds should scale up per stage** (each stage requires meaningfully more cumulative growth than the last) so highly active users don't exhaust content instantly, and so the pacing roughly maps to a semester or school year.
- **Major visual jumps (new building types unlocking, skyline changes) should be gated by real milestones**, not raw task count alone — e.g., finishing a semester, surviving finals week, hitting a personal on-time-completion record. Day-to-day task completions should feed *incremental* growth within a building; milestones trigger the *big* visible changes.
- Building-specific growth (e.g., library shelves filling) can happen continuously as matching tasks complete, giving frequent small feedback, while stage-level kingdom transformations stay reserved for milestones.

---

## The Mascot

- **Concept:** A modern tech assistant (AI/device) got pulled into this medieval world through unexplained means, and now exists partly as a character in the world and partly as the "spirit" of the laptop.
- **Voice:** Plays the isekai "you have been reincarnated as—" trope straight, with comedic anachronism — refers to modern tech concepts (Wi-Fi, notifications, updates) as if they're either lost magic or common knowledge nobody else understands.
- **Function, not just flavor:**
  - Narrates AI-parsed announcement discoveries in character (e.g., "the scrying is complete — three new decrees found in Professor [X]'s proclamation").
  - Appears specifically when a student **starts** a task (not just completes one) to reduce activation friction with encouragement.
  - Serves as onboarding guide and the recognizable "face" of the app.
  - Is the entity inhabiting the laptop — same character, two forms (robed figure in the world, "OS voice" inside the laptop).

---

## The Laptop

- **Appearance:** Visibly broken/scuffed (cracked corner, wonky hinge, worn stickers) — cosmetic only, must never imply actual unreliability of real functionality.
- **Function:** The literal container for the actual productivity UI — task list, schedule bar view, Pomodoro timer, music player, prioritization view. This UI is clean/modern/polished, deliberately contrasting with the pixel-art world outside.
- **Transition:** A lid-open/lid-close animation moment transitions between "World" (pixel art, mascot roaming, town view) and "OS" (laptop interior, real planner functionality).
- **Customization — Stickers:** Earned through the same reward economy as town-building (not a separate currency). Purely cosmetic — stickers, case colors, small cosmetic repairs (a healed crack, a fixed key) applied to the laptop's exterior/frame.
- Recommend building sticker/case-cosmetic options as a small set of modular, combinable assets (a handful of sticker designs, a few case color options) rather than many bespoke fully-designed laptop skins — keeps art cost low while combinations feel varied.

---

## Reskinned Tools (in-world flavor text, real functionality underneath)

| Real Feature | In-World Framing |
|---|---|
| Pomodoro timer | "Ancient time magic" / hourglass ritual |
| Music player (YouTube import) | Bard's enchanted lute; imported playlists = "songs collected from traveling minstrels" |
| Schedule / bar-chart view | The kingdom's road map — each task-bar is a path from today to its due date; a completed (frozen) bar becomes a paved road |
| Customization/shop | Royal treasury and market stalls |
| Notifications/reminders | Royal decrees or scout reports (e.g., "the scouts report a convergence of trials upon Thursday") |
| AI announcement parsing | Scrying / divination |

---

## Reward Economy

- Single currency earned through real productive behavior (task completion, on-time finishing per personalized timing signal, consistent usage) — not arbitrary login streaks disconnected from actual schoolwork.
- Spendable on: town decorations, building cosmetic upgrades, laptop stickers/case cosmetics.
- Avoid punishing streak mechanics — consider a limited number of "grace"/rest tokens that preserve a streak through a missed day rather than a hard reset to zero.

---

## Suggested Build Sequencing (for scope management)

This is the full vision. For an initial buildable version:
1. Build 4-5 fixed visual stages (not a fully modular/scalable tile system yet).
2. Implement 3-4 of the highest-value building categories first (e.g., Library, Workshop, Watchtower, Town Hall) rather than the full table.
3. Give the mascot a basic voice (name + a handful of dialogue lines for task-start / task-complete / announcement-found) before writing full lore.
4. Laptop stickers and full modular case customization can come after the core town-growth and mascot voice are working end-to-end.