export type TaskSpanInput = {
    startDate?: string;
    dueDate: string;
};

export function calculateGridSpan(
    task: TaskSpanInput,
    weekStartDate: Date
): string {
    const msPerDay = 1000 * 60 * 60 * 24;

    const monday = new Date(weekStartDate).setHours(0, 0, 0, 0);
    const due = parseLocalDate(task.dueDate).setHours(0, 0, 0, 0);

    const today = new Date().setHours(0, 0, 0, 0)
    const effectiveStart = task.startDate
        ? parseLocalDate(task.startDate).setHours(0, 0, 0, 0)
        : Math.max(today, monday);

    const startOffset = Math.floor((effectiveStart - monday) / msPerDay);
    const dueOffset = Math.floor((due - monday) / msPerDay);

    const startColumn = Math.max(1, Math.min(7, startOffset+1));
    const endColumn = Math.max(startColumn+1, Math.min(8, dueOffset + 3));

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