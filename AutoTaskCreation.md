# Auto Task Creation — Implementation Spec

## Why this design (context for whoever's implementing)
Earlier iterations considered: (1) full silent auto-insert — rejected because Jack found, from real personal use, that tasks appearing without any active gesture from him felt less "real" and were easier to lose track of; (2) confidence-gated silent insertion/suppression — rejected because a false "this is a duplicate" silently discards a real task with zero visibility, which is worse than a false positive; (3) a mandatory per-item approval queue for everything, including plain Canvas-native data — rejected because most Canvas-native assignments carry zero inference risk (a teacher's official Assignments-tab entry isn't "uncertain" the way an AI-inferred task is), so forcing per-item review on all of it reintroduces the exact manual-entry friction the app exists to remove, especially painful on first sync when a semester's worth of structured assignments (dozens to 100+) come in at once.

**Landed on: a unified "rundown" model.** Every new-task event surfaces a "here's what's new" screen — not a blocking modal, but the first thing shown on next app open — that gives Jack the thing he actually wanted (seeing everything that's going into his planner, not having it silently appear) without forcing correctness-review on data that was never uncertain.

## Pipeline (per announcement, AI-detection side)
1. **Extraction** (existing): Anthropic call infers candidate tasks from announcement text.
2. **Duplicate-check** (existing): for each candidate task, compare against real existing Canvas assignments; returns `isDuplicate`, `matchingAssignmentId`, `confidence` ('high'/'low'), `reason`.
3. **Validate the duplicate-check output before trusting it:** if `matchingAssignmentId` is present, verify it actually exists in the real candidate list that was passed into that call. If it doesn't exist (hallucinated ID), mark this task as "unresolved" rather than a confirmed duplicate — route it into the rundown like any other AI-detected item needing a decision.

## The Rundown screen
Shown as the first thing on app open whenever there's anything new since the user's last visit (a Canvas sync, an AI detection pass, or both). Two sections:

**"Added from Canvas" (informational only):**
- Plain Canvas-native assignments (structured, official Assignments-tab data, no AI inference involved) are already added to the planner by the time this screen shows.
- Listed here purely so the user *sees* what came in — no yes/no/maybe needed, since there's no correctness question to resolve.
- A lightweight "remove" option per item is fine for the rare case the user doesn't want one, but nothing is a forced action.

**"AI found these" (needs a real decision):**
- Every AI-detected candidate task (including duplicate-suspects and unresolved/invalid-ID cases from Step 3 above) is listed here with three controls: **Yes** (add to planner), **No** (discard), **Maybe** (defer — see below).
- Duplicate-suspects show their reason ("may already be covered by [existing assignment name]") so the user has context for the decision, but nothing is pre-suppressed or pre-added without them seeing it.
- **Maybe** doesn't discard or add — it parks the item in a small persistent "still deciding" list distinct from the main rundown, so deferred items don't just vanish (avoiding the old limbo problem) but also don't force an immediate binary call.

## Setting: Auto-accept AI-detected tasks
A toggle in settings (default: OFF) that, when enabled, skips the yes/no/maybe step specifically for AI-detected items:
- High-confidence, non-duplicate tasks auto-insert directly, tagged as AI-detected until dismissed/edited.
- High-confidence duplicates auto-suppress without surfacing.
- Genuinely uncertain/unresolved items still show up in the rundown even with this setting on — full automation shouldn't extend to ambiguous cases.
- This setting never affects the "Added from Canvas" section — that's always just informational, on or off.

## Logging (for accuracy tracking — feeds the eval work already planned)
Log every outcome and every user action on it:
- AI-detected items: yes/no/maybe rate, and for duplicate-suspects specifically, how often the user overrides the AI's suggestion (a real miss worth counting)
- "Maybe" items: how long they sit before being resolved, and what they're eventually resolved to
- Auto-inserted tasks (only relevant when the auto-accept setting is on): whether the user dismissed the AI tag (implicit confirmation) vs. deleted the task outright (implicit signal it was wrong)

This data is what answers "is this feature actually pulling its weight" with real numbers instead of guesswork — track it from day one of real usage, not just a debug console log.# Auto Task Creation — Implementation Spec

## Why this design (context for whoever's implementing)
Earlier iterations considered: (1) full silent auto-insert — rejected because Jack found, from real personal use, that tasks appearing without any active gesture from him felt less "real" and were easier to lose track of; (2) confidence-gated silent insertion/suppression — rejected because a false "this is a duplicate" silently discards a real task with zero visibility, which is worse than a false positive; (3) a mandatory per-item approval queue for everything, including plain Canvas-native data — rejected because most Canvas-native assignments carry zero inference risk (a teacher's official Assignments-tab entry isn't "uncertain" the way an AI-inferred task is), so forcing per-item review on all of it reintroduces the exact manual-entry friction the app exists to remove, especially painful on first sync when a semester's worth of structured assignments (dozens to 100+) come in at once.

**Landed on: a unified "rundown" model.** Every new-task event surfaces a "here's what's new" screen — not a blocking modal, but the first thing shown on next app open — that gives Jack the thing he actually wanted (seeing everything that's going into his planner, not having it silently appear) without forcing correctness-review on data that was never uncertain.

## Pipeline (per announcement, AI-detection side)
1. **Extraction** (existing): Anthropic call infers candidate tasks from announcement text.
2. **Duplicate-check** (existing): for each candidate task, compare against real existing Canvas assignments; returns `isDuplicate`, `matchingAssignmentId`, `confidence` ('high'/'low'), `reason`.
3. **Validate the duplicate-check output before trusting it:** if `matchingAssignmentId` is present, verify it actually exists in the real candidate list that was passed into that call. If it doesn't exist (hallucinated ID), mark this task as "unresolved" rather than a confirmed duplicate — route it into the rundown like any other AI-detected item needing a decision.

## The Rundown screen
Shown as the first thing on app open whenever there's anything new since the user's last visit (a Canvas sync, an AI detection pass, or both). Two sections:

**"Added from Canvas" (informational only):**
- Plain Canvas-native assignments (structured, official Assignments-tab data, no AI inference involved) are already added to the planner by the time this screen shows.
- Listed here purely so the user *sees* what came in — no yes/no/maybe needed, since there's no correctness question to resolve.
- A lightweight "remove" option per item is fine for the rare case the user doesn't want one, but nothing is a forced action.

**"AI found these" (needs a real decision):**
- Every AI-detected candidate task (including duplicate-suspects and unresolved/invalid-ID cases from Step 3 above) is listed here with three controls: **Yes** (add to planner), **No** (discard), **Maybe** (defer — see below).
- Duplicate-suspects show their reason ("may already be covered by [existing assignment name]") so the user has context for the decision, but nothing is pre-suppressed or pre-added without them seeing it.
- **Maybe** doesn't discard or add — it parks the item in a small persistent "still deciding" list distinct from the main rundown, so deferred items don't just vanish (avoiding the old limbo problem) but also don't force an immediate binary call.

## Setting: Auto-accept AI-detected tasks
A toggle in settings (default: OFF) that, when enabled, skips the yes/no/maybe step specifically for AI-detected items:
- High-confidence, non-duplicate tasks auto-insert directly, tagged as AI-detected until dismissed/edited.
- High-confidence duplicates auto-suppress without surfacing.
- Genuinely uncertain/unresolved items still show up in the rundown even with this setting on — full automation shouldn't extend to ambiguous cases.
- This setting never affects the "Added from Canvas" section — that's always just informational, on or off.

## Logging (for accuracy tracking — feeds the eval work already planned)
Log every outcome and every user action on it:
- AI-detected items: yes/no/maybe rate, and for duplicate-suspects specifically, how often the user overrides the AI's suggestion (a real miss worth counting)
- "Maybe" items: how long they sit before being resolved, and what they're eventually resolved to
- Auto-inserted tasks (only relevant when the auto-accept setting is on): whether the user dismissed the AI tag (implicit confirmation) vs. deleted the task outright (implicit signal it was wrong)

This data is what answers "is this feature actually pulling its weight" with real numbers instead of guesswork — track it from day one of real usage, not just a debug console log.