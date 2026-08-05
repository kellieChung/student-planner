export type TaskSpanInput = {
    startDate?: string;
    dueDate: string;
    isCompleted: boolean;
};

export function calculateGridSpan(
    task: TaskSpanInput,
    weekStartDate: Date
): string {
    const msPerDay = 1000 * 60 * 60 * 24;

    const monday = new Date(weekStartDate).setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate).setHours(0, 0, 0, 0);

    const today = new Date().setHours(0, 0, 0, 0)
    const effectiveStart = task.startDate
        ? new Date(task.startDate).setHours(0, 0, 0, 0)
        : (task.isCompleted? due: Math.max(today, monday));

    const startOffset = Math.floor((effectiveStart - monday) / msPerDay);
    const dueOffset = Math.floor((due - monday) / msPerDay);

    const startColumn = Math.max(1, Math.min(7, startOffset+1));
    const endColumn = Math.max(startColumn+1, Math.min(8, dueOffset + 2));

    return `${startColumn} / ${endColumn}`;
}