export type Assignment = {
    id: string;
    name: string;
    due: string;
    course: string;
    completed?: boolean;
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
    // Persisted, LLM-assisted short title for the card label
    // (lib/taskLabel.ts). Null/absent means "not yet computed" — the
    // card falls back to a live deterministic short title until a
    // background pass fills this in. Never recomputed once set.
    shortTitle?: string | null;
}