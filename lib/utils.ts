export type TaskSpanInput = {
    startDate?: string;
    dueDate: string;
};

export function calculateGridSpan(
    task: TaskSpanInput,
    weekStartDate: Date
): string {
    const msPerDay = 1000 * 60 * 60 * 24;

    const monday = new Date(weekStartDate);
    monday.setHours(0, 0, 0, 0);

    const due = parseLocalDate(task.dueDate);
    due.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = task.startDate
        ? parseLocalDate(task.startDate)
        : new Date(today);

    start.setHours(0, 0, 0, 0);

    /*
     * If a task is already overdue, show it only on its
     * due-date column rather than extending it backward.
     */
    if (due < today) {
        const dueOffset = Math.floor(
            (due.getTime() - monday.getTime()) / msPerDay
        );

        const dueColumn = Math.max(
            1,
            Math.min(7, dueOffset + 1)
        );

        return `${dueColumn} / ${dueColumn + 1}`;
    }

    const effectiveStart = start < monday
        ? monday
        : start;

    const startOffset = Math.floor(
        (effectiveStart.getTime() - monday.getTime()) / msPerDay
    );

    const dueOffset = Math.floor(
        (due.getTime() - monday.getTime()) / msPerDay
    );

    const startColumn = Math.max(
        1,
        Math.min(7, startOffset + 1)
    );
    const endColumn = Math.max(
        startColumn + 1,
        Math.min(8, dueOffset + 2)
    );

    return `${startColumn} / ${endColumn}`;
}

export function getTodayString(): string{
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`
}

export function parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day);
}
