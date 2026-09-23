import Anthropic from "@anthropic-ai/sdk";
import { OLLAMA_CHAT_URL, OLLAMA_MODEL, OLLAMA_NUM_CTX } from "@/lib/ollamaConfig";
import { ANTHROPIC_MODEL } from "@/lib/anthropicConfig";
import {
    describeAnthropicError,
    getAnthropicClient,
    getToolInput,
    isAnthropicEnabled,
    logAnthropicUsage,
} from "@/lib/ai/anthropicClient";
import { stripHtml, truncateText } from "@/lib/htmlText";

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

type AssignmentAnalysis = {
    importance: number;
    difficulty: number;
    consequence: number;
    assignmentType: AssignmentType;
    reason: string;
};

type AssignmentInput = {
    name: string;
    course: string;
    description?: string | null;
    due?: string | null;
    pointsPossible?: number | null;
};

const OLLAMA_TIMEOUT_MS = 25_000;

// Tokens budgeted per assignment in the batch response, plus a fixed
// overhead for JSON structure/formatting.
const PREDICT_TOKENS_PER_ASSIGNMENT = 200;
const PREDICT_TOKENS_BASE = 100;

// Deterministic keyword classification of an assignment's type, shared by
// `fallbackAssignmentAnalysis` below and by lib/taskLabel.ts's card-label
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

// Deterministic keyword-based fallback used whenever the Ollama call fails
// or returns something malformed — see CLAUDE.md's "must degrade
// gracefully" convention for lib/analyzeAssignment.ts and app/api/task-xp.
function fallbackAssignmentAnalysis(
    assignment: AssignmentInput
): AssignmentAnalysis {
    const assignmentType = classifyAssignmentType(assignment);
    const reason = "This estimate was generated using a fallback because AI analysis was unavailable.";

    if (assignmentType === "exam" || assignmentType === "test" || assignmentType === "project" || assignmentType === "presentation") {
        return { importance: 8, difficulty: 8, consequence: 7, assignmentType, reason };
    }

    if (assignmentType === "essay" || assignmentType === "lab" || assignmentType === "problem_set" || assignmentType === "homework") {
        return { importance: 6, difficulty: 6, consequence: 5, assignmentType, reason };
    }

    if (assignmentType === "quiz" || assignmentType === "reading" || assignmentType === "discussion" || assignmentType === "practice" || assignmentType === "reflection") {
        return { importance: 4, difficulty: 3, consequence: 3, assignmentType, reason };
    }

    return { importance: 4, difficulty: 3, consequence: 3, assignmentType, reason };
}

function buildAssignmentBlock(
    assignment: AssignmentInput,
    index: number
): string {
    return `
ASSIGNMENT ${index + 1}
NAME: ${assignment.name}
COURSE: ${assignment.course}
DESCRIPTION: ${assignment.description || "No description provided."}
DUE DATE: ${assignment.due || "No due date provided."}
POINTS POSSIBLE: ${assignment.pointsPossible ?? "Unknown"}
`;
}

/**
 * Analyzes a batch of assignments in a single model call (Claude Haiku
 * when ANTHROPIC_API_KEY is set, local Ollama otherwise) rather than one
 * call per assignment — each call resends the full rubric, so batching cuts
 * that fixed per-call cost proportionally. On the Ollama path a malformed
 * entry falls back for the whole batch (small batches); the Anthropic path
 * degrades per entry. Never throws — degrades to
 * `fallbackAssignmentAnalysis` on any failure (timeout, non-2xx, malformed
 * JSON).
 */
export async function analyzeAssignments(
    rawAssignments: AssignmentInput[]
): Promise<AssignmentAnalysis[]> {
    if (rawAssignments.length === 0) {
        return [];
    }

    // Canvas descriptions are raw HTML — see lib/htmlText.ts for why this
    // must never reach a prompt unstripped.
    const assignments = rawAssignments.map((assignment) => ({
        ...assignment,
        description: assignment.description
            ? truncateText(stripHtml(assignment.description), MAX_DESCRIPTION_LENGTH)
            : null,
    }));

    try {
        return isAnthropicEnabled()
            ? await analyzeAssignmentsWithAnthropic(assignments)
            : await analyzeAssignmentsWithOllama(assignments);
    } catch (error) {
        console.error("❌ Assignment analysis failed; using fallback:", error);
        return assignments.map(fallbackAssignmentAnalysis);
    }
}

// --------------------------------------------------------------------
// Anthropic path (primary when ANTHROPIC_API_KEY is set). Tuned for cost:
// a compressed rubric (these scores only break ties among tasks of similar
// urgency — see prioritizationModule.md — so a terse rubric is enough),
// and no free-text `reason` in the output since output tokens cost 5x
// input and the stored reason is never displayed.
// --------------------------------------------------------------------

const MAX_DESCRIPTION_LENGTH = 400;
const ANTHROPIC_TIMEOUT_MS = 30_000;
const ANTHROPIC_TOKENS_PER_ASSIGNMENT = 40;
const ANTHROPIC_REASON = "Estimated by AI.";

const SCORE_TOOL_NAME = "record_assignment_scores";

const SCORE_TOOL: Anthropic.Tool = {
    name: SCORE_TOOL_NAME,
    description: "Record one score entry per assignment, in order.",
    input_schema: {
        type: "object",
        properties: {
            results: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        index: { type: "integer" },
                        importance: { type: "integer" },
                        difficulty: { type: "integer" },
                        consequence: { type: "integer" },
                        assignmentType: { type: "string", enum: [...ASSIGNMENT_TYPES] },
                    },
                    required: ["index", "importance", "difficulty", "consequence", "assignmentType"],
                    additionalProperties: false,
                },
            },
        },
        required: ["results"],
        additionalProperties: false,
    },
    strict: true,
};

const SCORING_RUBRIC = `
You score student assignments for a planner. Judge each assignment independently, only from its own information; never invent grading policies, weights, or requirements. Scores are integers 1-10.

IMPORTANCE: academic significance vs. normal coursework. 1-2 routine/negligible; 3-4 ordinary homework, practice, participation; 5-6 meaningful graded work; 7-8 substantial graded work or key skill assessment; 9 major essay, project, or exam; 10 final exam or capstone. Points are evidence, not a formula. Don't confuse importance with difficulty or time.

DIFFICULTY: how challenging for a capable student. 1-2 trivial; 3-4 straightforward, familiar procedures; 5-6 moderate reasoning or multiple steps; 7-8 substantial reasoning, writing, or synthesis; 9-10 very to exceptionally demanding. Points are not a proxy for difficulty.

CONSEQUENCE: harm from missing it, submitting late, or doing poorly. 1-2 minimal; 3-4 small; 5-6 noticeable; 7-8 significant; 9-10 very to extremely significant. Use stated grading or late policy when given; otherwise infer cautiously.

"index" is the ASSIGNMENT number (1-based).
`.trim();

function clampScore(value: number): number {
    return Math.min(10, Math.max(1, Math.round(value)));
}

async function analyzeAssignmentsWithAnthropic(
    assignments: AssignmentInput[]
): Promise<AssignmentAnalysis[]> {
    let response: Anthropic.Message;

    try {
        response = await getAnthropicClient().messages.create(
            {
                model: ANTHROPIC_MODEL,
                max_tokens: 100 + ANTHROPIC_TOKENS_PER_ASSIGNMENT * assignments.length,
                temperature: 0,
                system: SCORING_RUBRIC,
                tools: [SCORE_TOOL],
                tool_choice: { type: "tool", name: SCORE_TOOL_NAME },
                messages: [
                    {
                        role: "user",
                        content: assignments.map(buildAssignmentBlock).join("\n"),
                    },
                ],
            },
            { timeout: ANTHROPIC_TIMEOUT_MS }
        );
    } catch (error) {
        throw describeAnthropicError("assignment scoring", error);
    }

    logAnthropicUsage("assignment scoring", response);

    const input = getToolInput(response, SCORE_TOOL_NAME) as { results?: unknown };

    if (!Array.isArray(input.results)) {
        throw new Error("Anthropic scoring tool call did not contain a results array.");
    }

    const resultsByIndex = new Map<number, Record<string, unknown>>();

    for (const entry of input.results) {
        if (entry && typeof entry === "object" && typeof (entry as { index?: unknown }).index === "number") {
            resultsByIndex.set((entry as { index: number }).index, entry as Record<string, unknown>);
        }
    }

    // Per-entry degradation: one missing/malformed entry falls back for
    // just that assignment rather than discarding the whole batch.
    return assignments.map((assignment, i) => {
        const entry = resultsByIndex.get(i + 1);

        if (
            !entry ||
            typeof entry.importance !== "number" ||
            typeof entry.difficulty !== "number" ||
            typeof entry.consequence !== "number"
        ) {
            return fallbackAssignmentAnalysis(assignment);
        }

        return {
            importance: clampScore(entry.importance),
            difficulty: clampScore(entry.difficulty),
            consequence: clampScore(entry.consequence),
            assignmentType: normalizeAssignmentType(entry.assignmentType),
            reason: ANTHROPIC_REASON,
        };
    });
}

async function analyzeAssignmentsWithOllama(
    assignments: AssignmentInput[]
): Promise<AssignmentAnalysis[]> {
    const prompt = `
You are an academic planning assistant. Analyze EACH of the following ${assignments.length} assignments independently, using the rubric below. Base your judgments only on the information provided for that specific assignment; do not invent grading policies, course weights, or requirements, and do not let one assignment's context influence another assignment's scores.

${assignments.map(buildAssignmentBlock).join("\n")}

RUBRIC

IMPORTANCE (1–10)
How academically significant is this assignment relative to normal coursework?

1–2: Minimal significance; routine work with little impact.
3–4: Low significance; ordinary homework, practice, or participation.
5–6: Moderate significance; meaningful graded work.
7–8: High significance; substantial graded work or important skill assessment.
9: Very high significance; major essay, project, exam, or assessment.
10: Exceptional significance; final exam, capstone, or major culminating assessment.

Consider assignment type, description, points, and academic purpose together.
Points are evidence, NOT a direct formula.
Do not confuse importance with difficulty or time.


DIFFICULTY (1–10)
How challenging is the work for a capable student in this course?

1–2: Almost trivial.
3–4: Straightforward; mostly familiar procedures.
5–6: Moderate reasoning or multiple steps.
7–8: Substantial reasoning, writing, problem-solving, synthesis, or concentration.
9: Very challenging; extensive independent or advanced work.
10: Exceptionally complex or demanding.

Do not use points as a proxy for difficulty.


CONSEQUENCE (1–10)
How harmful would it be to miss, submit late, or perform poorly on this assignment?

1–2: Minimal consequence.
3–4: Small consequence.
5–6: Noticeable consequence.
7–8: Significant consequence.
9: Very significant consequence.
10: Extremely consequential.

Use explicit grading or late-policy information when available.
If it is unknown, infer cautiously without inventing grade percentages or penalties.


ASSIGNMENT TYPE
Choose one:
homework, reading, reflection, discussion, quiz, test, exam, essay, project, presentation, lab, problem_set, practice, other


RETURN ONLY VALID JSON, with exactly one entry per assignment above, in this exact shape:

{
  "results": [
    {
      "index": 1,
      "importance": number,
      "difficulty": number,
      "consequence": number,
      "assignmentType": string,
      "reason": string
    }
  ]
}

Rules:
- "index" must match the ASSIGNMENT number above (1-based).
- importance, difficulty, and consequence must be integers from 1–10.
- reason should briefly explain the main factors behind that assignment's analysis.
- Do not include markdown or any text outside the JSON.
`;

    const response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            stream: false,
            format: "json",
            options: {
                num_ctx: OLLAMA_NUM_CTX,
                num_predict:
                    PREDICT_TOKENS_BASE +
                    PREDICT_TOKENS_PER_ASSIGNMENT * assignments.length,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(
            `Ollama request failed with status ${response.status}`
        );
    }

    const data = await response.json();

    const content =
        data?.message?.content;

    if (typeof content !== "string") {
        throw new Error(
            "Ollama returned an invalid response."
        );
    }

    let parsed: { results?: unknown };

    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error(
            `Ollama returned invalid JSON:\n${content}`
        );
    }

    if (!Array.isArray(parsed.results)) {
        throw new Error(
            "Ollama response did not contain a results array."
        );
    }

    const resultsByIndex = new Map<number, Record<string, unknown>>();

    for (const entry of parsed.results) {
        if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { index?: unknown }).index === "number"
        ) {
            resultsByIndex.set(
                (entry as { index: number }).index,
                entry as Record<string, unknown>
            );
        }
    }

    return assignments.map((_, i) => {
        const entry = resultsByIndex.get(i + 1);

        if (
            !entry ||
            typeof entry.importance !== "number" ||
            typeof entry.difficulty !== "number" ||
            typeof entry.consequence !== "number" ||
            typeof entry.reason !== "string"
        ) {
            throw new Error(
                `Ollama batch response is missing or malformed for assignment ${i + 1}.`
            );
        }

        return {
            importance: Math.min(
                10,
                Math.max(1, Math.round(entry.importance))
            ),

            difficulty: Math.min(
                10,
                Math.max(1, Math.round(entry.difficulty))
            ),

            consequence: Math.min(
                10,
                Math.max(1, Math.round(entry.consequence))
            ),

            assignmentType: normalizeAssignmentType(entry.assignmentType),

            reason: entry.reason.trim(),
        };
    });
}
