export type TaskImportance = "low" | "medium" | "high";

export type TaskPlanningEstimate = {
    estimatedMinutes: number;

    // AI analysis
    importance: number;
    difficulty: number;
    consequence: number;
    reason: string;

    // Optional: absent on estimates cached before this field existed.
    assignmentType?: string;

    // Deterministic priority calculation
    priorityScore: number;
    urgencyScore: number;
    frogScore: number;
    priorityReason: string;

    signature: string;
};

export type TaskPlanningEstimates =
    Record<string, TaskPlanningEstimate>;

export type TaskPriority = {
    level: "critical" | "high" | "medium" | "low";
    label: string;
    rank: number;
};