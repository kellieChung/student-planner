import { classifyAssignmentType } from "@/lib/assignmentType";
import { parseLocalDate } from "@/lib/utils";

// The only type values a card label can ever show. TODO is reserved for
// tasks under a user-added custom course (never-school, e.g. "Personal")
// — a real Canvas-synced task always resolves to HW/R/EXAM, never a
// generic catch-all, even when the finer-grained classifier below can't
// pin down a more specific school type.
export type LabelType = "HW" | "R" | "EXAM" | "TODO";

export function classifyLabelType(input: {
    name: string;
    course: string;
    description?: string | null;
    isCustomCourse?: boolean;
}): LabelType {
    if (input.isCustomCourse) return "TODO";

    // The finer-grained 14-value classifier still drives priority
    // scoring/time estimates/the procrastination index elsewhere
    // (lib/analyzeAssignment.ts) — reused here only to decide EXAM vs. R
    // vs. the general HW bucket, untouched otherwise.
    const type = classifyAssignmentType(input);

    if (type === "exam" || type === "test" || type === "quiz") return "EXAM";
    if (type === "reading") return "R";

    return "HW";
}

const COURSE_ABBREVIATION_FILLER_WORDS = new Set(["the", "of", "and", "to", "in", "a", "an"]);

// Deterministic default used only when a course has no user-set
// `abbreviation` — an override always wins over this.
export function courseAbbreviationDefault(courseName: string): string {
    const words = courseName
        .trim()
        .split(/\s+/)
        .filter((word) => word && !COURSE_ABBREVIATION_FILLER_WORDS.has(word.toLowerCase()));

    if (words.length > 1) {
        return words
            .map((word) => word[0].toUpperCase())
            .join("")
            .slice(0, 4);
    }

    const singleWord = (words[0] ?? courseName).replace(/[^a-zA-Z]/g, "");
    return singleWord.slice(0, 4).toUpperCase() || "CRS";
}

const DAY_CODES = ["SU", "M", "T", "W", "TH", "F", "SA"];

// Fully capitalized; two letters only where a single letter would be
// ambiguous (Thursday vs. Tuesday) or where Sunday/Saturday would
// otherwise collide with Saturday/Sunday as a single "S".

export function dayCode(dueDateKey: string | null | undefined): string | null {
    if (!dueDateKey) return null;

    return DAY_CODES[parseLocalDate(dueDateKey).getDay()];
}

export type TaskLabelPart = "course" | "type" | "day" | "name";

export const TASK_LABEL_PARTS: TaskLabelPart[] = ["course", "type", "day", "name"];

export const DEFAULT_TASK_LABEL_PARTS: TaskLabelPart[] = ["course", "type", "day", "name"];

export function isTaskLabelPart(value: unknown): value is TaskLabelPart {
    return typeof value === "string" && (TASK_LABEL_PARTS as string[]).includes(value);
}

// The student's visible parts, in order. "name" is always kept so a card
// can never be reduced to bare codes.
export function normalizeTaskLabelParts(value: unknown): TaskLabelPart[] {
    if (!Array.isArray(value)) return DEFAULT_TASK_LABEL_PARTS;

    const parts = [...new Set(value.filter(isTaskLabelPart))];
    if (!parts.includes("name")) parts.push("name");

    return parts;
}

export function isDefaultTaskLabelParts(parts: TaskLabelPart[]): boolean {
    return parts.length === DEFAULT_TASK_LABEL_PARTS.length
        && parts.every((part, index) => part === DEFAULT_TASK_LABEL_PARTS[index]);
}

type FormatTaskLabelInput = {
    courseAbbreviation: string;
    typeCode: string;
    dueDateKey: string | null | undefined;
    name: string;
};

export function formatTaskLabel(
    input: FormatTaskLabelInput,
    parts: TaskLabelPart[] = DEFAULT_TASK_LABEL_PARTS,
): string {
    const values: Record<TaskLabelPart, string> = {
        course: input.courseAbbreviation,
        type: input.typeCode,
        day: dayCode(input.dueDateKey) ?? "—",
        name: input.name,
    };

    return parts.map((part) => values[part]).join(" - ");
}
