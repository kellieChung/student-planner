export type Assignment = {
    id: string;
    name: string;
    due: string;
    course: string;
    completed?: boolean;
    // When the task first became visible in the planner. Absent for tasks
    // synced before this field existed.
    createdAt?: string;
}