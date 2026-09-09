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
    // suggestion (components/AIReviewPanel.tsx) — the Announcement.id it
    // came from. Absent for every other task (Canvas-synced or manually
    // added).
    sourceAnnouncementId?: string | null;
    // Manual override for the card's type code (lib/taskLabel.ts's
    // LabelType) — set when classifyLabelType guessed wrong. Absent/null
    // means "use the live classification." Inlined rather than imported
    // from lib/taskLabel.ts, which imports Assignment from here.
    typeOverride?: "HW" | "R" | "EXAM" | "TODO" | null;
}