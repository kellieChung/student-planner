export type TaskImportance = "low" | "medium" | "high";

export type TaskPlanningEstimate = {
    estimatedMinutes: number;
    importance: TaskImportance;
    signature: string;
};

export type TaskPlanningEstimates = Record<string, TaskPlanningEstimate>;

export type TaskPriority = {
    level: "critical" | "high" | "medium" | "low";
    label: string;
    rank: number;
};
