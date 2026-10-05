// Deterministic assignment-type helpers with no model or SDK dependency, so
// client components (card labels, the landing demo) can import them without
// pulling in lib/analyzeAssignment.ts's Anthropic client.

export const ASSIGNMENT_TYPES = [
    "homework", "reading", "reflection", "discussion", "quiz", "test", "exam",
    "essay", "project", "presentation", "lab", "problem_set", "practice", "other",
] as const;

export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export function normalizeAssignmentType(value: unknown): AssignmentType {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

    return (ASSIGNMENT_TYPES as readonly string[]).includes(normalized)
        ? (normalized as AssignmentType)
        : "other";
}

/**
 * Deterministic, non-AI time estimate keyed off the assignment type — no
 * Ollama call needed for this. A per-student historical estimator (actual
 * completion time by type, once we track it) is the natural next step;
 * this keyword/type bucket is the placeholder until then.
 */
export function estimateMinutesByType(type: AssignmentType): number {
    switch (type) {
        case "exam":
        case "test":
        case "project":
            return 180;
        case "essay":
        case "presentation":
            return 120;
        case "homework":
        case "problem_set":
        case "lab":
            return 75;
        case "quiz":
        case "reading":
        case "discussion":
        case "reflection":
        case "practice":
            return 30;
        default:
            return 20;
    }
}

// Deterministic keyword classification of an assignment's type, shared by
// lib/analyzeAssignment.ts's fallback and by lib/taskLabel.ts's card-label
// normalization (which needs a type code without ever calling Ollama).
// Narrower patterns are checked before broader ones (e.g. "quiz" before
// "test|exam") so a quiz doesn't fall into the exam bucket.
export function classifyAssignmentType(text: {
    name: string;
    course?: string;
    description?: string | null;
}): AssignmentType {
    const haystack =
        `${text.name} ${text.course ?? ""} ${text.description ?? ""}`
            .toLowerCase();

    if (/\bquiz(zes)?\b/.test(haystack)) return "quiz";
    if (/\b(midterms?|final exams?|exams?)\b/.test(haystack)) return "exam";
    if (/\btests?\b/.test(haystack)) return "test";
    if (/\b(discussions?|discussion board|forum post)\b/.test(haystack)) return "discussion";
    if (/\breflections?\b/.test(haystack)) return "reflection";
    if (/\b(problem sets?|psets?|p-sets?)\b/.test(haystack)) return "problem_set";
    if (/\blabs?\b/.test(haystack)) return "lab";
    if (/\bpresentations?\b/.test(haystack)) return "presentation";
    if (/\b(projects?|capstones?)\b/.test(haystack)) return "project";
    if (/\b(essays?|research papers?)\b/.test(haystack)) return "essay";
    // Explicit "homework"/"hw" checked before the weaker practice/reading
    // signals below, so e.g. "Homework 2: Derivatives Practice" still
    // classifies as homework rather than practice.
    if (/\b(homework|hw)\b/.test(haystack)) return "homework";
    if (/\b(practice|drills?|worksheets?)\b/.test(haystack)) return "practice";
    if (/\b(readings?|chapter\s*\d|pp?\.\s*\d)/.test(haystack)) return "reading";
    // Imperative "read"/"watch"/"video" without the noun "reading" (e.g.
    // "Read Ch. 3", "Watch Lecture 4", "Video: Cell Division") — folded
    // into the same "reading" bucket rather than a new type/label.
    if (/\b(read|watch(?:ing)?|videos?)\b/.test(haystack)) return "reading";

    return "other";
}

// Reconciles the AI's stored type with the task name's keyword type. The
// AI sometimes labels e.g. "Week 5 Discussion" as an essay, and since the
// time estimate is a lookup on type, that turned a 30-minute post into a
// 2-hour task. The name keyword wins only when the AI said "other" or the
// keyword type is the *smaller* one: the classifier checks exam/test before
// discussion, so a blanket keyword-wins rule would turn "Exam Review
// Discussion" into a 3-hour exam. Name only — descriptions mention "essay"
// etc. too loosely.
export function resolveAssignmentType(
    aiType: unknown,
    task: { name: string }
): AssignmentType {
    const ai = normalizeAssignmentType(aiType);
    const keyword = classifyAssignmentType({ name: task.name });

    if (keyword === "other") return ai;
    if (ai === "other") return keyword;

    return estimateMinutesByType(keyword) < estimateMinutesByType(ai) ? keyword : ai;
}
