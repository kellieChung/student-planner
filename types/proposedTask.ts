export type ProposedTask = {
    name: string;
    course: string;
    due: string | null;
    sourceAnnouncementId: string;
    confidence: "high" | "medium" | "low";
};