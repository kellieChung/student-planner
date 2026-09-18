export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export type RecurringTask = {
    id: string;
    name: string;
    course: string;
    typeOverride: "HW" | "R" | "EXAM" | "TODO" | null;
    frequency: RecurrenceFrequency;
    interval: number;
    // 0=Sun..6=Sat, only meaningful when frequency === "weekly".
    weekdays: number[];
    startDate: string;
    endDate: string | null;
    dueTime: string | null;
    active: boolean;
    createdAt: string;
}
