import { daysBetween, getStartOfWeek, parseLocalDate } from "@/lib/utils";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export const RECURRENCE_FREQUENCIES = new Set<RecurrenceFrequency>([
    "daily",
    "weekly",
    "monthly",
]);

export type RecurrenceRule = {
    frequency: RecurrenceFrequency;
    interval: number;
    // 0=Sun..6=Sat, only consulted when frequency === "weekly".
    weekdays: number[];
    startDate: string;
    endDate: string | null;
};

function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// Pure Y/M/D arithmetic (never derives a UTC instant), so it's safe to run
// server-side despite this app's "no server-side timezone guessing" rule —
// that rule is about resolving a time-of-day into an instant, not about
// shifting a plain date key by whole days.
export function shiftDateKey(dateKey: string, days: number): string {
    const date = parseLocalDate(dateKey);
    date.setDate(date.getDate() + days);

    return toDateKey(date);
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function monthsBetween(a: Date, b: Date): number {
    return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

// Every occurrence date a rule produces within [fromKey, toKey] (inclusive
// on both ends), also clamped to the rule's own startDate/endDate. Pure and
// framework-free so it can be exercised the same ad-hoc way
// lib/prioritization.test.ts already is (`npx tsx`), and reused both
// client-side (materialization, lib/utils.ts's resolveDueTime needs a real
// browser timezone per occurrence) and server-side (defense-in-depth
// re-validation that a client-submitted date actually belongs to the rule).
export function expandOccurrences(
    rule: RecurrenceRule,
    fromKey: string,
    toKey: string
): string[] {
    const rangeStart = parseLocalDate(
        rule.startDate > fromKey ? rule.startDate : fromKey
    );
    const rangeEndKey =
        rule.endDate && rule.endDate < toKey ? rule.endDate : toKey;
    const rangeEnd = parseLocalDate(rangeEndKey);

    if (rangeStart > rangeEnd) return [];

    const startDate = parseLocalDate(rule.startDate);
    const interval = Math.max(1, Math.floor(rule.interval) || 1);
    const dates: string[] = [];

    if (rule.frequency === "daily") {
        for (
            let cursor = new Date(rangeStart);
            cursor <= rangeEnd;
            cursor.setDate(cursor.getDate() + 1)
        ) {
            if (daysBetween(cursor, startDate) % interval === 0) {
                dates.push(toDateKey(cursor));
            }
        }

        return dates;
    }

    if (rule.frequency === "weekly") {
        const weekdays = new Set(rule.weekdays);
        const anchorWeekStart = getStartOfWeek(startDate);

        for (
            let cursor = new Date(rangeStart);
            cursor <= rangeEnd;
            cursor.setDate(cursor.getDate() + 1)
        ) {
            if (!weekdays.has(cursor.getDay())) continue;

            const cursorWeekStart = getStartOfWeek(cursor);
            const weeksSinceAnchor = daysBetween(cursorWeekStart, anchorWeekStart) / 7;

            if (weeksSinceAnchor % interval === 0) {
                dates.push(toDateKey(cursor));
            }
        }

        return dates;
    }

    // monthly: anchor day-of-month clamped to each candidate month's real
    // length (e.g. Jan 31 -> Feb 28/29).
    const anchorDay = startDate.getDate();
    const cursorMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const lastMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

    while (cursorMonth <= lastMonth) {
        const offset = monthsBetween(cursorMonth, startDate);

        if (offset >= 0 && offset % interval === 0) {
            const day = Math.min(
                anchorDay,
                daysInMonth(cursorMonth.getFullYear(), cursorMonth.getMonth())
            );
            const occurrence = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), day);

            if (occurrence >= rangeStart && occurrence <= rangeEnd) {
                dates.push(toDateKey(occurrence));
            }
        }

        cursorMonth.setMonth(cursorMonth.getMonth() + 1);
    }

    return dates;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Human-readable summary for EditTaskModal's read-only "Repeats every ..."
// line and RecurringTasksPanel's list.
export function describeRecurrenceRule(rule: RecurrenceRule): string {
    let prefix: string;

    if (rule.frequency === "daily") {
        prefix = rule.interval > 1 ? `Every ${rule.interval} days` : "Every day";
    } else if (rule.frequency === "weekly") {
        const days = [...rule.weekdays]
            .sort((a, b) => a - b)
            .map((day) => WEEKDAY_LABELS[day])
            .join("/");
        const weekPart = rule.interval > 1 ? `${rule.interval} weeks` : "week";

        prefix = `Every ${weekPart}${days ? ` on ${days}` : ""}`;
    } else {
        prefix = rule.interval > 1 ? `Every ${rule.interval} months` : "Every month";
    }

    const suffix = rule.endDate ? ` until ${rule.endDate}` : "";

    return `${prefix}${suffix}`;
}
