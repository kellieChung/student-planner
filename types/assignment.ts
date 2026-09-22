export type Assignment = {
    id: string;
    name: string;
    due: string;
    course: string;
    completed?: boolean;
    inProgress?: boolean;
    // When the task first became visible in the planner. Absent for tasks
    // synced before this field existed.
    createdAt?: string;
    // Raw UTC instant from Canvas, resolved into `due`/`dueFraction`
    // client-side (WeeklyPlannerView.tsx) using the viewer's own
    // timezone. Absent for custom tasks (they have no time-of-day).
    dueAt?: string | null;
    // Time-of-day of `due`, as a 0-1 fraction (0 = midnight, 1 = end of
    // day). Absent means "treat as end of day" for grid-span rendering.
    dueFraction?: number;
    // Set only for a custom task created by accepting an AI announcement
    // suggestion (the Rundown screen's "AI found these" section) — the
    // Announcement.id it came from. Absent for every other task
    // (Canvas-synced or manually added). Doubles as the "AI-detected"
    // provenance marker for the card badge below.
    sourceAnnouncementId?: string | null;
    // Set when the user has dismissed the "AI-detected" badge on this
    // card (implicit confirmation the task is correct) — distinct from
    // later deleting the task outright (implicit signal it was wrong),
    // both logged for AutoTaskCreation.md's accuracy tracking. Only
    // meaningful when sourceAnnouncementId is also set.
    aiTagDismissedAt?: string | null;
    // Manual override for the card's type code (lib/taskLabel.ts's
    // LabelType) — set when classifyLabelType guessed wrong. Absent/null
    // means "use the live classification." Inlined rather than imported
    // from lib/taskLabel.ts, which imports Assignment from here.
    typeOverride?: "HW" | "R" | "EXAM" | "TODO" | null;
    // Set when this task is a materialized occurrence of a RecurringTask
    // (id shape "custom-r<recurringTaskId>-<due>"). Absent for a plain
    // custom task or a Canvas-synced assignment.
    recurrenceId?: string | null;
    // Set when this single occurrence was edited via the "this occurrence
    // only" scope — a later "this and following" series edit skips it.
    recurrenceOverridden?: boolean;
}