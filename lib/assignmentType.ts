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
type TypePattern = {
    type: AssignmentType;
    matches: (haystack: string, name: string) => boolean;
};

// Ordered: classifyAssignmentType takes the first match, so narrower
// patterns come before broader ones (e.g. "quiz" before "test|exam").
const TYPE_PATTERNS: TypePattern[] = [
    { type: "quiz", matches: (h) => /\bquiz(zes)?\b/.test(h) },
    { type: "exam", matches: (h) => /\b(midterms?|final exams?|exams?)\b/.test(h) },
    { type: "test", matches: (h) => /\btests?\b/.test(h) },
    { type: "discussion", matches: (h) => /\b(discussions?|discussion board|forum post)\b/.test(h) },
    // Instructors often label discussions "DISCUSS: <topic>". Prefix-with-
    // separator only, so "Essay: Discuss the causes…" isn't caught.
    { type: "discussion", matches: (_h, name) => /^\W*discuss\s*[:\-–—|]/.test(name) },
    { type: "reflection", matches: (h) => /\breflections?\b/.test(h) },
    { type: "problem_set", matches: (h) => /\b(problem sets?|psets?|p-sets?)\b/.test(h) },
    { type: "lab", matches: (h) => /\blabs?\b/.test(h) },
    { type: "presentation", matches: (h) => /\bpresentations?\b/.test(h) },
    { type: "project", matches: (h) => /\b(projects?|capstones?)\b/.test(h) },
    { type: "essay", matches: (h) => /\b(essays?|research papers?)\b/.test(h) },
    // Explicit "homework"/"hw" checked before the weaker practice/reading
    // signals below, so e.g. "Homework 2: Derivatives Practice" still
    // classifies as homework rather than practice.
    { type: "homework", matches: (h) => /\b(homework|hw)\b/.test(h) },
    { type: "practice", matches: (h) => /\b(practice|drills?|worksheets?)\b/.test(h) },
    { type: "reading", matches: (h) => /\b(readings?|chapter\s*\d|pp?\.\s*\d)/.test(h) },
    // Imperative "read"/"watch"/"video" without the noun "reading" (e.g.
    // "Read Ch. 3", "Watch Lecture 4", "Video: Cell Division") — folded
    // into the same "reading" bucket rather than a new type/label.
    { type: "reading", matches: (h) => /\b(read|watch(?:ing)?|videos?)\b/.test(h) },
];

function matchingTypes(text: { name: string; course?: string; description?: string | null }): AssignmentType[] {
    const haystack =
        `${text.name} ${text.course ?? ""} ${text.description ?? ""}`
            .toLowerCase();
    const name = text.name.toLowerCase();

    return TYPE_PATTERNS
        .filter((pattern) => pattern.matches(haystack, name))
        .map((pattern) => pattern.type);
}

export function classifyAssignmentType(text: {
    name: string;
    course?: string;
    description?: string | null;
}): AssignmentType {
    return matchingTypes(text)[0] ?? "other";
}

// Canvas's own submission type, when it settles the question:
// discussion_topic is always a discussion; online_quiz is a quiz unless
// the name says exam (a "Midterm Exam" built as a Canvas quiz). "test"
// deliberately stays a quiz, so "Practice Test" doesn't become 180 min.
// New Quizzes report external_tool and fall through to keywords (null).
export function typeFromSubmissionTypes(
    submissionTypes: readonly string[] | null | undefined,
    name: string
): AssignmentType | null {
    if (!submissionTypes?.length) return null;
    if (submissionTypes.includes("discussion_topic")) return "discussion";

    if (submissionTypes.includes("online_quiz")) {
        return /\b(midterms?|finals?|exams?)\b/.test(name.toLowerCase()) ? "exam" : "quiz";
    }

    return null;
}

// canvasType arrives as a plain string (types/assignment.ts is import-free).
function knownCanvasType(value: string | null | undefined): AssignmentType | null {
    const type = normalizeAssignmentType(value);
    return type === "other" ? null : type;
}

// A type known without the AI: Canvas's own type, else an unambiguous
// name keyword. Null means only the AI can tell (the server's gate for which
// tasks get an AI call at all).
export function deterministicType(task: { name: string; canvasType?: string | null }): AssignmentType | null {
    const canvas = knownCanvasType(task.canvasType);
    if (canvas) return canvas;

    // A name matching types with different time estimates ("Exam Review
    // Discussion", "DISCUSS: Exam 2 prep") is ambiguous: the AI decides.
    // Same-minutes overlaps (e.g. quiz + reading) stay free.
    const matches = matchingTypes({ name: task.name });
    if (matches.length === 0) return null;
    if (new Set(matches.map(estimateMinutesByType)).size > 1) return null;

    return matches[0];
}

// Reconciles the AI's stored type with what's known without it. Canvas's
// own type always wins. Otherwise the AI sometimes labels e.g. "Week 5
// Discussion" as an essay, and since the time estimate is a lookup on
// type, that turned a 30-minute post into a 2-hour task. The name keyword
// wins only when the AI said "other" or the keyword type is the *smaller*
// one: the classifier checks exam/test before discussion, so a blanket
// keyword-wins rule would turn "Exam Review Discussion" into a 3-hour
// exam. Name only — descriptions mention "essay" etc. too loosely.
export function resolveAssignmentType(
    aiType: unknown,
    task: { name: string; canvasType?: string | null }
): AssignmentType {
    const canvas = knownCanvasType(task.canvasType);
    if (canvas) return canvas;

    const ai = normalizeAssignmentType(aiType);
    const keyword = classifyAssignmentType({ name: task.name });

    if (keyword === "other") return ai;
    if (ai === "other") return keyword;

    return estimateMinutesByType(keyword) < estimateMinutesByType(ai) ? keyword : ai;
}

export type TypeScores = { importance: number; difficulty: number; consequence: number };

// Default 1-10 scores for a type: the AI fallback, and every estimate
// whose type is known without the AI.
export function scoresForType(type: AssignmentType): TypeScores {
    switch (type) {
        case "exam":
        case "test":
        case "project":
        case "presentation":
            return { importance: 8, difficulty: 8, consequence: 7 };
        case "essay":
        case "lab":
        case "problem_set":
        case "homework":
            return { importance: 6, difficulty: 6, consequence: 5 };
        default:
            return { importance: 4, difficulty: 3, consequence: 3 };
    }
}

// Nudges importance/consequence by how this task's points compare with the
// course's typical assignment, so a 100-point project outranks a 5-point
// check-in of the same type. No-op without both numbers.
export function adjustScoresForPoints(
    scores: TypeScores,
    pointsPossible: number | null | undefined,
    coursePointsMedian: number | null | undefined
): TypeScores {
    if (!pointsPossible || !coursePointsMedian) return scores;

    const ratio = pointsPossible / coursePointsMedian;
    const shift = ratio >= 3 ? 2 : ratio >= 1.5 ? 1 : ratio <= 1 / 3 ? -1 : 0;
    const clamp = (value: number) => Math.min(10, Math.max(1, value + shift));

    return { ...scores, importance: clamp(scores.importance), consequence: clamp(scores.consequence) };
}
