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

// Cap how much of a bar the due-time inset can hide, so an early-in-the-day
// due time on a single-day task doesn't shrink the bar to an unreadable
// sliver — every bar keeps at least 60% of its column's width, even though
// that's less than a strictly time-proportional inset would allow. This is
// a floor, not a perfect fix: two due times whose raw insets both land
// above the cap (e.g. two times close together, both earlier in the day)
// will still look similar once both get clamped to it — only times spread
// further apart across the day are guaranteed a visibly different length.
const MAX_END_INSET_PERCENT = 40;

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
            endInsetPercent: Math.min(MAX_END_INSET_PERCENT, (1 - dueFraction) * 100),
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
        endInsetPercent: Math.min(
            MAX_END_INSET_PERCENT,
            ((1 - dueFraction) / columnsSpanned) * 100
        ),
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

// Combines a "YYYY-MM-DD" due date with an optional "HH:MM" time-of-day
// into the dueAt/dueFraction pair calculateGridSpan and AssignmentCard
// expect. An empty time means "end of day" — the same default already
// used when both fields are simply absent.
export function resolveDueTime(
    dueDateKey: string,
    time: string
): { dueAt: string | null; dueFraction: number | undefined } {
    if (!time) {
        return { dueAt: null, dueFraction: undefined };
    }

    const [hours, minutes] = time.split(":").map(Number);
    const due = parseLocalDate(dueDateKey);
    due.setHours(hours, minutes, 0, 0);

    return {
        dueAt: due.toISOString(),
        dueFraction: (hours * 60 + minutes) / (24 * 60),
    };
}

// Inverse of resolveDueTime's time component, for hydrating an
// <input type="time"> from an existing dueAt. Absent dueAt (or a task
// with no time-of-day) means "end of day" — represented as "".
export function formatTimeInputValue(dueAt: string | null | undefined): string {
    if (!dueAt) return "";

    const date = new Date(dueAt);

    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatEstimatedMinutes(minutes: number): string {
    return minutes >= 60
        ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
        : `${minutes}m`;
}
