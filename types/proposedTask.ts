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
    // sourceAnnouncementId + normalized name) — used to persist an
    // accept/reject decision (AnnouncementSuggestionReview) since a
    // ProposedTask itself has no id and a positional index isn't stable
    // across re-extraction.
    suggestionKey: string;

    canvasMatch: {
        // "unavailable" means the duplicate check itself failed/degraded
        // (timeout, malformed response, no nearby assignments to compare
        // against) — distinct from "none", which means the AI genuinely
        // checked and found no match.
        status: "none" | "possible" | "definite" | "unavailable";
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
