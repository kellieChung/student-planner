export type ProposedTask = {
    name: string;
    course: string;
    due: string | null;
    dueText: string | null;
    description: string;
    evidence: string;
    sourceAnnouncementId: string;
    confidence: "high" | "medium" | "low";

    // Client-only: the AI pipeline never sets this. Populated when the
    // user overrides the suggestion's classified type in the review card
    // before accepting — mirrors Assignment["typeOverride"].
    typeOverride?: "HW" | "R" | "EXAM" | "TODO" | null;

    // Stable content-derived identity for this suggestion (hash of
    // sourceAnnouncementId + normalized name) — used to persist its
    // pending/accepted/rejected/maybe state (AnnouncementSuggestionReview)
    // since a ProposedTask itself has no id and a positional index isn't
    // stable across re-extraction.
    suggestionKey: string;

    canvasMatch: {
        // "unavailable" means the duplicate check itself failed/degraded
        // (timeout, malformed response, no nearby assignments to compare
        // against) — distinct from "none", which means the AI genuinely
        // checked and found no match. "unresolved" means the model flagged
        // this as a likely duplicate but returned an out-of-range/
        // unresolvable match number (see lib/ai/findDuplicateTask.ts's
        // uncertainDuplicateResult) — AutoTaskCreation.md step 3 requires
        // this be routed to the user as its own case, not silently folded
        // into "possible".
        status: "none" | "possible" | "definite" | "unavailable" | "unresolved";
        // Duplicate-check's own confidence, carried through on every
        // branch (including "none") — auto-accept (lib/rundownAutoAccept.ts)
        // gates on this, not on the extraction `confidence` above.
        checkConfidence: "high" | "medium" | "low";
        assignmentId: string | null;
        reason: string;

        assignment: {
            id: string;
            name: string;
            description: string | null;
            dueDate: string | null;
        } | null;
    };

    // Original Canvas announcement that produced this task
    sourceAnnouncement?: {
        id: string;
        title: string;
        message: string;
        course: string;
        postedAt: string;
    };
};
