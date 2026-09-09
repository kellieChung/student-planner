// Deterministic per-course color, so any course name (synced or
// custom-added) gets a stable, theme-consistent badge color instead of a
// flat gray fallback for anything outside a hardcoded name list.
// Deliberately avoids blue/indigo (the app's accent color), green (done),
// rose/red (overdue), and amber/yellow (urgent/frog) — those hues already
// carry a status meaning elsewhere in the planner.
const COURSE_COLORS = [
    "bg-teal-700",
    "bg-purple-700",
    "bg-fuchsia-700",
    "bg-lime-700",
    "bg-cyan-700",
    "bg-pink-700",
    "bg-violet-700",
    "bg-orange-700",
];

export function courseColorDefault(course: string): string {
    let hash = 0;

    for (let i = 0; i < course.length; i++) {
        hash = (hash * 31 + course.charCodeAt(i)) | 0;
    }

    return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}
