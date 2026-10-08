import { formatEstimatedMinutes, parseLocalDate, toDateKey } from "@/lib/utils";

// Beta placeholders — tune freely. A day is "heavy" when either is reached.
export const WORKLOAD_THRESHOLDS = {
    heavyMinutes: 180,
    heavyTaskCount: 5,
} as const;

export const WORKLOAD_WINDOW_DAYS = 7;

export type DayWorkload = {
    taskCount: number;
    minutes: number;
    heavy: boolean;
};

type WorkloadTask = {
    due: string;
    dueAt?: string | null;
};

// The viewer's local calendar day of the stored UTC instant; date-only
// tasks (no dueAt) already carry their day.
export function workloadDayKey(task: WorkloadTask): string {
    return task.dueAt ? toDateKey(new Date(task.dueAt)) : task.due;
}

// setDate, not +24h, so a DST change can't skip or repeat a day.
export function upcomingDayKeys(today: string, count: number = WORKLOAD_WINDOW_DAYS): string[] {
    const start = parseLocalDate(today);

    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return toDateKey(date);
    });
}

// `tasks` must already be incomplete only. A task with no estimate counts
// toward taskCount but adds no minutes.
export function computeWorkload<T extends WorkloadTask>(
    tasks: T[],
    estimateFor: (task: T) => number | undefined,
    today: string
): Map<string, DayWorkload> {
    const byDay = new Map<string, DayWorkload>(
        upcomingDayKeys(today).map((key) => [key, { taskCount: 0, minutes: 0, heavy: false }])
    );

    for (const task of tasks) {
        const day = byDay.get(workloadDayKey(task));
        if (!day) continue;

        day.taskCount += 1;
        day.minutes += estimateFor(task) ?? 0;
    }

    for (const day of byDay.values()) {
        day.heavy = day.minutes >= WORKLOAD_THRESHOLDS.heavyMinutes
            || day.taskCount >= WORKLOAD_THRESHOLDS.heavyTaskCount;
    }

    return byDay;
}

export function formatWorkload({ taskCount, minutes }: Pick<DayWorkload, "taskCount" | "minutes">): string {
    const count = `${taskCount} ${taskCount === 1 ? "task" : "tasks"}`;

    return minutes > 0 ? `${count} · ~${formatEstimatedMinutes(minutes)}` : count;
}
