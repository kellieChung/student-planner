# Auto task creation (the Rundown) — spec, implemented

## Why this design
Rejected: silent auto-insert (tasks that appear without a gesture felt less real and were easy to lose); confidence-gated silent insert/suppress (a false "duplicate" silently discards a real task); mandatory per-item approval of everything (Canvas-native assignments carry no inference risk, and reviewing 100+ on first sync recreates the manual-entry friction the app removes). **Chosen:** a non-blocking Rundown shown on next open whenever something is new, so the user sees everything entering the planner without reviewing data that was never uncertain.

## Pipeline (per announcement)
1. **Extraction:** an LLM infers candidate tasks from announcement text.
2. **Duplicate check:** each candidate is compared to real Canvas assignments (`isDuplicate`, `matchingAssignmentId`, `confidence`, `reason`).
3. **Validate before trusting:** if `matchingAssignmentId` isn't in the candidate list actually sent, treat the task as **unresolved** (not a confirmed duplicate) and surface it for a decision.

## Rundown
- **Added from Canvas** (informational): Canvas-native assignments are already in the planner; listed so the user sees them. Optional per-item remove; no decision required.
- **AI found these** (needs a decision): every AI candidate, including duplicate-suspects (shown with "may already be covered by X") and unresolved ones, with **Yes** (add), **No** (discard), **Maybe** (parks it in a persistent Still Deciding list, so nothing vanishes and nothing forces a binary call).

## Setting: auto-accept AI-detected tasks (default off)
When on: high-confidence non-duplicates auto-insert (tagged AI-detected until dismissed/edited); high-confidence duplicates auto-suppress; uncertain/unresolved items still show. Never affects "Added from Canvas".

## Logging (accuracy tracking)
Log yes/no/maybe rates and how often users override a duplicate suggestion; how long "Maybe" items wait and what they resolve to; for auto-inserted tasks, whether the AI tag was dismissed (implicit confirm) or the task deleted (implicit miss). Stored as `AiTaskEvent` rows from day one.
