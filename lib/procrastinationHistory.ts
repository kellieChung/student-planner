import { ProcrastinationHistory, ProcrastinationRecord } from "@/types/procrastination";

// Rolling window: keep the ranking responsive to recent behavior instead of
// averaging in a semester's worth of history. Mirrors the server-side cap
// in app/api/procrastination-history/route.ts.
const MAX_RECORDS_PER_TYPE = 12;

/*
 * A task that was added and due within this window couldn't have been left
 * late in any meaningful sense, so it carries no procrastination signal and
 * would only dilute the average.
 */
const MIN_WINDOW_HOURS = 24;

// Was localStorage-only ("procrastination_history") — moved server-side
// (ProcrastinationRecord) since this history never carried over between
// browser profiles for the same account. Same async-wrapper shape as
// lib/gamification.ts; the component owns the loaded history as React
// state and passes it into the pure functions below.

export async function getProcrastinationHistory(): Promise<ProcrastinationHistory> {
    try {
        const response = await fetch("/api/procrastination-history");

        if (!response.ok) return {};

        const data = await response.json() as {
            records?: ProcrastinationRecord[];
        };

        const history: ProcrastinationHistory = {};

        for (const record of data.records ?? []) {
            const type = record.taskType.trim().toLowerCase();
            history[type] = [...(history[type] ?? []), record];
        }

        return history;
    } catch {
        return {};
    }
}

// Pure — computes the new history with `record` appended (and this type's
// list capped to the rolling window), for an optimistic local update. The
// caller is responsible for also calling recordTaskCompletion to persist it.
export function appendProcrastinationRecord(
    history: ProcrastinationHistory,
    record: ProcrastinationRecord
): ProcrastinationHistory {
    const type = record.taskType.trim().toLowerCase();
    const existing = history[type] ?? [];

    return {
        ...history,
        [type]: [...existing, record].slice(-MAX_RECORDS_PER_TYPE),
    };
}

export function recordTaskCompletion(record: ProcrastinationRecord): void {
    fetch("/api/procrastination-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
    }).catch((error) => {
        console.error("Could not save procrastination record", error);
    });
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
export function getProcrastinationIndexHours(
    history: ProcrastinationHistory,
    taskType: string
): number | null {
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
