import { classifyAssignmentType, estimateMinutesByType } from "@/lib/assignmentType";
import { daysBetween, isDateKey, parseLocalDate } from "@/lib/utils";

// Purely time-based (no model call): a task without a planning estimate gets
// the same deterministic type→minutes estimate task-planning uses.
function xpFromEstimatedMinutes(estimatedMinutes: unknown): number | null {
    const minutes = typeof estimatedMinutes === "number" ? estimatedMinutes : Number(estimatedMinutes);

    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    if (minutes <= 15) return 10;
    if (minutes <= 30) return 20;
    if (minutes <= 60) return 35;
    if (minutes <= 120) return 50;
    if (minutes <= 240) return 75;
    return 100;
}

function latePenalty(daysLate: number): number {
    if (daysLate <= 0) return 1;
    if (daysLate === 1) return 0.8;
    if (daysLate <= 3) return 0.6;
    if (daysLate <= 7) return 0.4;
    return 0.2;
}

function calculateDaysLate(due: unknown, completedAt: unknown): number {
    if (!isDateKey(due) || !isDateKey(completedAt)) return 0;

    return Math.max(0, daysBetween(parseLocalDate(completedAt), parseLocalDate(due)));
}

export type XpInput = {
    name: string;
    course: string;
    due?: unknown;
    completedAt?: unknown;
    estimatedMinutes?: unknown;
};

export function computeTaskXp(task: XpInput): number {
    const baseXp =
        xpFromEstimatedMinutes(task.estimatedMinutes) ??
        xpFromEstimatedMinutes(estimateMinutesByType(classifyAssignmentType({ name: task.name, course: task.course }))) ??
        20;

    return Math.max(5, Math.floor((baseXp * latePenalty(calculateDaysLate(task.due, task.completedAt))) / 5) * 5);
}
