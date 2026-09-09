export type TaskStatus = "not_started" | "in_progress" | "completed";

export function getTaskStatus(completed: boolean, inProgress: boolean): TaskStatus {
    if (completed) return "completed";
    if (inProgress) return "in_progress";
    return "not_started";
}

export function nextTaskStatus(status: TaskStatus): TaskStatus {
    if (status === "not_started") return "in_progress";
    if (status === "in_progress") return "completed";
    return "not_started";
}
