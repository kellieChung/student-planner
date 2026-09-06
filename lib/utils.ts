export type TaskSpanInput = {
    startDate?: string;
    dueDate: string;
    // Time-of-day of dueDate, 0 (midnight) to 1 (end of day). Absent
    // means "treat as end of day" — a full-width bar, same as before
    // this existed.
    dueFraction?: number;
};

export type GridSpan = {
    gridColumn: string;
    // How much of the bar's total rendered width to leave uncovered on
    // its right edge, as a percentage — lets the bar's end land
    // proportionally within its final day's column based on the actual
    // due time (e.g. an 8 AM due time ends near the start of that day's
    // segment) instead of always reaching the column's far edge.
    endInsetPercent: number;
};

export function calculateGridSpan(
    task: TaskSpanInput,
    weekStartDate: Date
): GridSpan {
    const dueFraction = task.dueFraction ?? 1;

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
        const dueOffset = daysBetween(due, monday);

        const dueColumn = Math.max(
            1,
            Math.min(7, dueOffset + 1)
        );

        return {
            gridColumn: `${dueColumn} / ${dueColumn + 1}`,
            endInsetPercent: (1 - dueFraction) * 100,
        };
    }

    const effectiveStart = start < monday
        ? monday
        : start;

    const startOffset = daysBetween(effectiveStart, monday);

    const dueOffset = daysBetween(due, monday);

    const startColumn = Math.max(
        1,
        Math.min(7, startOffset + 1)
    );
    const endColumn = Math.max(
        startColumn + 1,
        Math.min(8, dueOffset + 2)
    );

    const columnsSpanned = endColumn - startColumn;

    return {
        gridColumn: `${startColumn} / ${endColumn}`,
        endInsetPercent: ((1 - dueFraction) / columnsSpanned) * 100,
    };
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

// Whole-calendar-day difference (a - b), immune to the 23/25-hour days a
// naive `(a.getTime() - b.getTime()) / MS_PER_DAY` produces across a DST
// transition — this diffs Y/M/D components via UTC instead of raw local
// timestamps.
export function daysBetween(a: Date, b: Date): number {
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

    return Math.round((utcA - utcB) / (1000 * 60 * 60 * 24));
}
