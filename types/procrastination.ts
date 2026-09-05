export type ProcrastinationRecord = {
    taskType: string;
    addedAt: string;
    dueAt: string;
    completedAt: string;
};

export type ProcrastinationHistory = Record<string, ProcrastinationRecord[]>;
