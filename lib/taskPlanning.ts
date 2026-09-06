import { Assignment } from "@/types/assignment";
import { TaskPlanningEstimates, TaskPriority } from "@/types/taskPlanning";
import { parseLocalDate, daysBetween } from "@/lib/utils";

const STORAGE_KEY = "task_planning_estimates";

// Local Ollama inference is CPU/GPU-heavy per call — auto-estimating a
// whole backlog (150+ assignments) back-to-back visibly heats up the
// machine. Scope it down: only tasks due soon are worth estimating
// proactively, and even then, only up to a hard ceiling per pass. Tasks
// with no due date are never auto-estimated (nothing to window/rank them
// by) — see prioritizationModule.md.
const ESTIMATION_WINDOW_DAYS = 21;
const ESTIMATION_CAP = 60;

export function getTaskSignature(task: Pick<Assignment, "name" | "course">): string {
    return `${task.name.trim()}|${task.course.trim()}`;
}

export function selectTasksNeedingEstimates(
    tasks: Assignment[],
    estimates: TaskPlanningEstimates
): Assignment[] {
    const windowEnd = new Date();
    windowEnd.setHours(0, 0, 0, 0);
    windowEnd.setDate(windowEnd.getDate() + ESTIMATION_WINDOW_DAYS);

    const eligible = tasks.filter((task) => {
        if (!task.due) return false;
        return parseLocalDate(task.due) <= windowEnd;
    });

    const needingEstimates = eligible.filter(
        (task) => estimates[task.id]?.signature !== getTaskSignature(task)
    );

    if (needingEstimates.length <= ESTIMATION_CAP) {
        return needingEstimates;
    }

    return [...needingEstimates]
        .sort((a, b) => parseLocalDate(a.due).getTime() - parseLocalDate(b.due).getTime())
        .slice(0, ESTIMATION_CAP);
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
        const due = new Date(`${task.due}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilDue = daysBetween(due, today);

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
