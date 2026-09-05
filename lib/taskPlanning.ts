import { Assignment } from "@/types/assignment";
import { TaskPlanningEstimates, TaskPriority } from "@/types/taskPlanning";

const STORAGE_KEY = "task_planning_estimates";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function getTaskSignature(task: Pick<Assignment, "name" | "course">): string {
    return `${task.name.trim()}|${task.course.trim()}`;
}

export function getTaskPlanningEstimates(): TaskPlanningEstimates {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) return {};

    try {
        return JSON.parse(stored) as TaskPlanningEstimates;
    } catch {
        return {};
    }
}

export function saveTaskPlanningEstimates(estimates: TaskPlanningEstimates) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estimates));
}

function importanceLevel(importance: number): "high" | "medium" | "low" {
    return importance >= 8 ? "high" : importance >= 5 ? "medium" : "low";
}

export function getTaskPriority(
    task: Assignment,
    importance: number = 5
): TaskPriority {
    const importanceOffset = importance >= 8 ? 0 : importance >= 5 ? 1 : 2;

    if (task.due) {
        const due = new Date(`${task.due}T00:00:00`).getTime();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.floor((due - today.getTime()) / MS_PER_DAY);

        if (daysUntilDue < 0) return { level: "critical", label: "Overdue", rank: 0 };
        if (daysUntilDue === 0) return { level: "high", label: "Due today", rank: 1 + importanceOffset };
        if (daysUntilDue === 1) return { level: "high", label: "Due tomorrow", rank: 4 + importanceOffset };

        return {
            level: daysUntilDue <= 3 ? "high" : importanceLevel(importance),
            label: `Due in ${daysUntilDue} days`,
            rank: 1 + daysUntilDue * 3 + importanceOffset,
        };
    }

    if (importance >= 8) return { level: "high", label: "Do first", rank: 1_000_000 };
    if (importance >= 5) return { level: "medium", label: "Plan next", rank: 1_000_001 };
    return { level: "low", label: "When ready", rank: 1_000_002 };
}
