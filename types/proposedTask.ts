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
