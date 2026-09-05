import { ProcrastinationHistory, ProcrastinationRecord } from "@/types/procrastination";

const STORAGE_KEY = "procrastination_history";

// Rolling window: keep the ranking responsive to recent behavior instead of
// averaging in a semester's worth of history.
const MAX_RECORDS_PER_TYPE = 12;

/*
 * A task that was added and due within this window couldn't have been left
 * late in any meaningful sense, so it carries no procrastination signal and
 * would only dilute the average.
 */
const MIN_WINDOW_HOURS = 24;

export function getProcrastinationHistory(): ProcrastinationHistory {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) return {};

    try {
        return JSON.parse(stored) as ProcrastinationHistory;
    } catch {
        return {};
    }
}

export function recordTaskCompletion(record: ProcrastinationRecord): void {
    const history = getProcrastinationHistory();
    const type = record.taskType.trim().toLowerCase();
    const existing = history[type] ?? [];

    history[type] = [...existing, record].slice(-MAX_RECORDS_PER_TYPE);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function hoursBetween(from: string, to: string): number {
    return (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60);
}

/**
 * Average hours-before-deadline this student has historically finished
 * tasks of this type: positive means they tend to finish early, negative
 * (or close to zero) means they tend to finish at or after the deadline.
 * Returns null when there's no usable history yet, so callers can fall
 * back to plain deadline-proximity sorting.
 */
export function getProcrastinationIndexHours(taskType: string): number | null {
    const history = getProcrastinationHistory();
    const records = history[taskType.trim().toLowerCase()] ?? [];

    const usableRecords = records.filter((record) => {
        const windowHours = hoursBetween(record.addedAt, record.dueAt);
        return !Number.isFinite(windowHours) || windowHours >= MIN_WINDOW_HOURS;
    });

    if (usableRecords.length === 0) return null;

    const totalHoursBeforeDeadline = usableRecords.reduce(
        (sum, record) => sum + hoursBetween(record.completedAt, record.dueAt),
        0
    );

    return totalHoursBeforeDeadline / usableRecords.length;
}
