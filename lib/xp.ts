import { classifyAssignmentType, normalizeAssignmentType, type AssignmentType } from "@/lib/assignmentType";
import { daysBetween, isDateKey, parseLocalDate } from "@/lib/utils";

// By task type, not estimated minutes: students can edit their estimates, so
// minutes would let anyone inflate XP. Tiers are narrow so a misclassified
// task costs or gains little.
function xpForAssignmentType(type: AssignmentType): number {
    switch (type) {
        case "essay":
        case "project":
        case "presentation":
        case "test":
        case "exam":
            return 40;
        case "homework":
        case "problem_set":
        case "lab":
            return 25;
        default:
            return 15;
    }
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
    // The AI's stored classification; the student's typeOverride is
    // deliberately not used, so XP can't be raised by relabelling.
    assignmentType?: string | null;
};

export function computeTaskXp(task: XpInput): number {
    const type = task.assignmentType
        ? normalizeAssignmentType(task.assignmentType)
        : classifyAssignmentType({ name: task.name, course: task.course });
    const baseXp = xpForAssignmentType(type);

    return Math.max(5, Math.floor((baseXp * latePenalty(calculateDaysLate(task.due, task.completedAt))) / 5) * 5);
}
