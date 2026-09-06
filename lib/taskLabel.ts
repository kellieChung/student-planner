import { Assignment } from "@/types/assignment";
import { classifyAssignmentType } from "@/lib/analyzeAssignment";
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

const SHORT_TITLE_MAX_LENGTH = 20;

const SHORT_TITLE_LEADING_LABEL =
    /^(homework|reading|reflection|discussion|quiz|lab|essay|project|problem set|hw|pset)\s*[:#-]?\s*/i;
// "Week N" and a leading weekday name are scheduling metadata that
// duplicate what the DAY segment already shows elsewhere in the label —
// strip them the same way a leading type-word label gets stripped.
const LEADING_WEEK_LABEL = /^week\s*\d+\s*/i;
const LEADING_WEEKDAY_LABEL =
    /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\.?,?\s+/i;
const TRAILING_NUMBER_OR_RANGE = /\b(?:pp?\.?\s*)?(\d+(?:\s*[-–]\s*\d+)?)\b/g;
// Deliberately excludes "assignment" — it reads as generic filler in a
// title like "Reading Assignment", but is itself the only distinguishing
// content in a title like "In-Class Assignment", so it isn't safe to
// strip unconditionally.
const FILLER_WORDS = /\b(chapter|ch\.?|pages?|pgs?\.?|due|the)\b/gi;

// Breaks only on a word boundary at or before `maxLength` — never mid-token,
// so a trailing page range like "113-207" can't get cut in half.
function truncateOnWordBoundary(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");

    return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim();
}

type ShortTitleInput = {
    name: string;
    course: string;
    typeCode: LabelType;
};

// Always-available, non-AI short title: strips the course name/type-word
// prefix and filler words, keeps the last number/page-range as the
// distinguishing identifier, and truncates to a card-sized length. Serves
// both as the final fallback when Ollama is unavailable/hasn't run yet,
// and as the pre-processed input handed to Ollama for further shortening.
export function deterministicShortTitle(input: ShortTitleInput): string {
    let text = input.name.trim();

    const coursePrefix = new RegExp(`^${input.course.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:-]\\s*`, "i");

    // Leading noise (course name, "Week N", a weekday name, a type-word
    // label) can appear in any order/combination, so strip repeatedly
    // until nothing more matches rather than assuming one fixed order.
    let previous: string;
    do {
        previous = text;
        text = text.replace(coursePrefix, "");
        text = text.replace(LEADING_WEEK_LABEL, "");
        text = text.replace(LEADING_WEEKDAY_LABEL, "");
        text = text.replace(SHORT_TITLE_LEADING_LABEL, "");
    } while (text !== previous);

    let lastNumber: string | null = null;
    for (const match of text.matchAll(TRAILING_NUMBER_OR_RANGE)) {
        lastNumber = match[1];
    }

    text = text.replace(FILLER_WORDS, "");
    // Strip stray ":"/"#" and standalone "-" separators (leftover from a
    // stripped label, e.g. "- Derivatives"), but leave a dash embedded in
    // a number range like "113-207" or a compound word intact.
    text = text.replace(/[:#]+/g, " ").replace(/(^|\s)[-–]+(\s|$)/g, " ").replace(/\s+/g, " ").trim();

    // If the only thing left after stripping is the number itself (e.g.
    // "Homework 2" -> "2"), the number alone isn't a useful label on its
    // own — pair it back with the type code ("HW 2") instead. If real
    // descriptive content survived (e.g. "Beowulf 113-207"), keep it as
    // the number is a genuinely distinguishing part of that content.
    const numberPattern = lastNumber
        ? new RegExp(`\\b${lastNumber.replace(/[-–]/g, "\\s*[-–]\\s*")}\\b`)
        : null;
    const withoutNumber = numberPattern ? text.replace(numberPattern, "").trim() : text;

    if (!withoutNumber) {
        text = lastNumber
            ? `${input.typeCode} ${lastNumber}`
            : input.name.trim().split(/\s+/).slice(0, 3).join(" ");
    }

    return truncateOnWordBoundary(text, SHORT_TITLE_MAX_LENGTH);
}

type FormatTaskLabelInput = {
    courseAbbreviation: string;
    typeCode: LabelType;
    dueDateKey: string | null | undefined;
    shortTitle: string | null | undefined;
    name: string;
    course: string;
};

export function formatTaskLabel(input: FormatTaskLabelInput): string {
    const day = dayCode(input.dueDateKey) ?? "—";
    const title =
        input.shortTitle ??
        deterministicShortTitle({
            name: input.name,
            course: input.course,
            typeCode: input.typeCode,
        });

    return `${input.courseAbbreviation} - ${input.typeCode} - ${day} - ${title}`;
}

// Local Ollama inference is heavy per call (see lib/taskPlanning.ts's
// ESTIMATION_WINDOW_DAYS/CAP for the same load-management reasoning) —
// scope short-title generation to a near-term window in both directions
// so a large backlog never triggers a big background pass, and cap the
// count per pass. Distinct window from the estimate feature's (forward
// only) — this one is centered on "the current week".
const SHORT_TITLE_WINDOW_DAYS_BEFORE = 14;
const SHORT_TITLE_WINDOW_DAYS_AFTER = 14;
const SHORT_TITLE_PROCESS_CAP = 60;

export function selectTasksNeedingShortTitles(tasks: Assignment[]): Assignment[] {
    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - SHORT_TITLE_WINDOW_DAYS_BEFORE);

    const windowEnd = new Date();
    windowEnd.setHours(0, 0, 0, 0);
    windowEnd.setDate(windowEnd.getDate() + SHORT_TITLE_WINDOW_DAYS_AFTER);

    // Custom (non-Canvas) tasks have no DB row to persist a shortTitle
    // onto — they always render the live deterministic short title.
    const eligible = tasks.filter((task) => {
        if (!task.due || task.shortTitle || task.id.startsWith("custom-")) return false;

        const due = parseLocalDate(task.due);
        return due >= windowStart && due <= windowEnd;
    });

    if (eligible.length <= SHORT_TITLE_PROCESS_CAP) {
        return eligible;
    }

    return [...eligible]
        .sort((a, b) => parseLocalDate(a.due).getTime() - parseLocalDate(b.due).getTime())
        .slice(0, SHORT_TITLE_PROCESS_CAP);
}
