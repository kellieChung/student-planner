export type TaskSpanInput = {
    startDate?: string;
    dueDate: string;
    // Time-of-day of dueDate, 0 (midnight) to 1 (end of day). Absent
    // means "treat as end of day" — a full-width bar, same as before
    // this existed.
    dueFraction?: number;
};

export type GridSpan = {
    // How much of the bar's total rendered width to leave uncovered on
    // its right edge, as a percentage — lets the bar's end land
    // proportionally within its final day's column based on the actual
    // due time (e.g. an 8 AM due time ends near the start of that day's
    // segment) instead of always reaching the column's far edge.
    endInsetPercent: number;
    // 1-indexed day-column line numbers (1..8) a task spans — always
    // columnEnd > columnStart. AssignmentCard derives its own left/width
    // from these to stay pixel-aligned with the weekly grid's divider
    // layer (see packColumnOffsets below).
    columnStart: number;
    columnEnd: number;
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
            endInsetPercent: Math.min(MAX_END_INSET_PERCENT, (1 - dueFraction) * 100),
            columnStart: dueColumn,
            columnEnd: dueColumn + 1,
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
        endInsetPercent: Math.min(
            MAX_END_INSET_PERCENT,
            ((1 - dueFraction) / columnsSpanned) * 100
        ),
        columnStart: startColumn,
        columnEnd: endColumn,
    };
}

// Fixed card heights for the weekly grid's absolutely-positioned task
// layer (AssignmentCard's h-[72px]/h-[28px]) — deterministic so
// packColumnOffsets can compute vertical layout from data alone, with no
// DOM measurement/ResizeObserver. Verified live: every active card
// (regardless of whether its detail line renders) and every completed
// card render at these exact heights.
export const CARD_HEIGHT_PX = { completed: 28, active: 72 } as const;
// Matches the removed CSS grid's gap-y-3 (0.75rem).
export const CARD_GAP_PX = 12;

// Assigns each task a pixel Y-offset within its own day-column(s), instead
// of relying on CSS Grid's row mechanic — a CSS grid row's height is set by
// whichever column's item is tallest *that row*, which produced large dead
// space under short (completed) cards sharing a row with a tall (active)
// bar in another column.
//
// Tracks a real list of occupied [start, end] intervals per column (a
// skyline), not a single ever-growing cursor — a monotonic cursor can't
// "forget" that a bar spanning a congested column and a mostly-empty one
// only actually used the congested column's range, so it wrongly blocks
// later bars in the empty column too. `items` must already be in the
// desired processing order (single-day tasks first, then bars due-date
// ascending — see WeeklyPlannerView.tsx); this function only decides
// *offset*, never reorders.
//
// `orderGroup` (bars only) enforces due-date order *within* a status
// group via a secondary per-(group, column) floor, while leaving bars
// from *different* groups free to interleave through the skyline alone —
// e.g. a completed bar blocked low by another column's congestion must
// never be jumped above by a later completed bar sharing its column, but
// an active bar is free to use column space a completed bar left
// untouched, regardless of due date. Single-day items need no
// `orderGroup`: a bar's last occupied column is always its own due
// column (`columnEnd - 1 = dueColumn`, since calculateGridSpan's
// `startColumn + 1` floor never binds for valid data — see Fix 1's
// comment above), so any bar sharing a column with a single-day task is
// due on-or-after it — single-day-first processing order alone already
// guarantees "bars sink below every single-day task" for every dataset.
//
// Returns `totalHeight` alongside the offsets so the container's
// rendered height and the packing itself can never drift apart (a
// mismatch there would clip the last card in the tallest column).
export function packColumnOffsets(
    items: { id: string; columnStart: number; columnEnd: number; heightPx: number; orderGroup?: string }[]
): { offsets: Map<string, number>; totalHeight: number } {
    const columnIntervals: Record<number, Array<[number, number]>> = {};
    const groupFloor: Record<string, Record<number, number>> = {};
    const offsets = new Map<string, number>();

    for (const item of items) {
        const end = Math.max(item.columnEnd, item.columnStart + 1);
        const cols: number[] = [];
        for (let col = item.columnStart; col < end; col++) cols.push(col);

        // Every already-placed interval in any column this item touches,
        // padded by the gap so a new item never lands flush against a
        // neighbor, then merged into non-overlapping ranges to scan.
        const blocking: [number, number][] = [];
        for (const col of cols) {
            for (const [start, stop] of columnIntervals[col] ?? []) {
                blocking.push([start - CARD_GAP_PX, stop + CARD_GAP_PX]);
            }
        }
        blocking.sort((a, b) => a[0] - b[0]);
        const merged: [number, number][] = [];
        for (const [start, stop] of blocking) {
            const last = merged[merged.length - 1];
            if (last && start <= last[1]) {
                last[1] = Math.max(last[1], stop);
            } else {
                merged.push([start, stop]);
            }
        }

        // Start from this item's same-group floor (if any), THEN walk
        // the merged blocking ranges — order matters: computing the
        // skyline gap first and maxing with the floor afterward could
        // land back inside a later blocking range the floor jumped past.
        let y = 0;
        if (item.orderGroup) {
            const floor = groupFloor[item.orderGroup] ?? {};
            for (const col of cols) y = Math.max(y, floor[col] ?? 0);
        }
        for (const [start, stop] of merged) {
            if (y + item.heightPx <= start) break;
            y = Math.max(y, stop);
        }

        offsets.set(item.id, y);
        for (const col of cols) {
            (columnIntervals[col] ??= []).push([y, y + item.heightPx]);
        }
        if (item.orderGroup) {
            groupFloor[item.orderGroup] ??= {};
            for (const col of cols) {
                groupFloor[item.orderGroup][col] = y + item.heightPx + CARD_GAP_PX;
            }
        }
    }

    let totalHeight = 0;
    for (const intervals of Object.values(columnIntervals)) {
        for (const [, stop] of intervals) {
            totalHeight = Math.max(totalHeight, stop);
        }
    }

    return { offsets, totalHeight };
}

// Sunday-start "current week," matching the convention this app actually
// uses everywhere the planner grid itself defines "this week" (app/page.tsx,
// WeeklyPlannerView.tsx's returnToCurrentWeek) — extracted here so every
// caller shares one definition instead of re-deriving it (a prior
// independent re-derivation in app/api/ai/analyze-announcements/route.ts
// used Monday as the week start instead, silently disagreeing with the
// planner about which week is "current").
export function getStartOfWeek(date: Date = new Date()): Date {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);

    return start;
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

// A custom start-date override only makes sense going forward — once it's
// in the past the task should behave exactly as if no override were set
// (auto = today), not keep "starting" further in the past every day it
// goes un-edited. `today` is passed in (not read internally) so every call
// site in the same render agrees on "now," including across a live
// day-rollover.
export function hasCustomStartDatePassed(startAt: string, today: string): boolean {
    return parseLocalDate(startAt) < parseLocalDate(today);
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

// Synthesizes a concrete end-of-day instant for a date-only override —
// resolveDueTime's auto-mode dueAt:null is right for a fresh Assignment
// (no override wanted yet), but a due-DATE edit made while in auto mode
// still needs a real instant to persist as dueAtOverride, or the new date
// is silently dropped.
export function endOfDayInstant(dueDateKey: string): string {
    const due = parseLocalDate(dueDateKey);
    due.setHours(23, 59, 59, 999);

    return due.toISOString();
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
