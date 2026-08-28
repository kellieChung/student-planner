export type ProposedTask = {
    name: string;

    course: string;

    due: string | null;

    dueText: string | null;

    description: string;

    evidence: string;

    sourceAnnouncementId: string;

    confidence: "high" | "medium" | "low";

    canvasMatch: {
        status: "none" | "possible" | "definite";

        assignmentId: string | null;

        reason: string;
    };
};