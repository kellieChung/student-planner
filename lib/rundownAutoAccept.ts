import { ProposedTask } from "@/types/proposedTask";

export type AutoAction = "auto-insert" | "auto-suppress" | "surface";

// Gates AutoTaskCreation.md's "Auto-accept AI-detected tasks" setting.
// Deliberately keys off the duplicate-check's own confidence
// (canvasMatch.checkConfidence), never the extraction `confidence` field —
// the setting is about how sure the duplicate verdict is, not how sure the
// AI is that a task exists at all. Anything not explicitly high-confidence
// (medium/low, or "unresolved") surfaces regardless of the setting, per
// the spec's "full automation shouldn't extend to ambiguous cases."
//
// Only called server-side (app/api/ai/analyze-announcements/route.ts),
// never re-derived client-side, so what gets persisted/auto-inserted can
// never drift from what the client believes it should show.
export function classifyAutoAction(task: ProposedTask): AutoAction {
    const { status, checkConfidence } = task.canvasMatch;

    if (status === "definite" && checkConfidence === "high") {
        return "auto-suppress";
    }

    if (status === "none" && checkConfidence === "high") {
        return "auto-insert";
    }

    return "surface";
}
