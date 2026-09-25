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

function relativeLuminance(hex: string): number {
    const channels = [1, 3, 5].map((start) => {
        const value = parseInt(hex.slice(start, start + 2), 16) / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

const DARK_TEXT = "#161b33";
const LIGHT_TEXT = "#ffffff";

// Text colour for a badge sitting on a user-picked "#rrggbb" — whichever of
// navy or white has the higher WCAG contrast, so a pale yellow never gets
// white text. Anything that isn't a 6-digit hex falls back to white.
export function readableTextColor(hex: string): string {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return LIGHT_TEXT;

    const luminance = relativeLuminance(hex);
    const againstWhite = 1.05 / (luminance + 0.05);
    const againstDark = (luminance + 0.05) / (relativeLuminance(DARK_TEXT) + 0.05);

    return againstDark > againstWhite ? DARK_TEXT : LIGHT_TEXT;
}
