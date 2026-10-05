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
import { ASSIGNMENT_TYPES, classifyAssignmentType, normalizeAssignmentType, scoresForType, type AssignmentType } from "@/lib/assignmentType";

// Pure type helpers live in lib/assignmentType.ts so client code can use them
// without bundling the Anthropic SDK; re-exported for existing server imports.
export {
    ASSIGNMENT_TYPES,
    classifyAssignmentType,
    estimateMinutesByType,
    normalizeAssignmentType,
    resolveAssignmentType,
    type AssignmentType,
} from "@/lib/assignmentType";

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


// Deterministic keyword-based fallback used whenever the Ollama call fails
// or returns something malformed — see CLAUDE.md's "must degrade
// gracefully" convention for lib/analyzeAssignment.ts and lib/xp.ts.
// Callers compare against this to avoid persisting a fallback as if it were
// a real estimate (it would then never be retried).
export const FALLBACK_ANALYSIS_REASON = "This estimate was generated using a fallback because AI analysis was unavailable.";

// Stored (and reused like an AI estimate) when the type was settled by
// Canvas or a name keyword and no AI call was made.
export const DETERMINISTIC_ANALYSIS_REASON = "Estimated from the assignment type.";

export function fallbackAssignmentAnalysis(
    assignment: AssignmentInput
): AssignmentAnalysis {
    const assignmentType = classifyAssignmentType(assignment);

    return { ...scoresForType(assignmentType), assignmentType, reason: FALLBACK_ANALYSIS_REASON };
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
        console.error("Assignment analysis failed; using fallback:", error);
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
// A ceiling, not a spend — only generated tokens are billed.
const ANTHROPIC_MAX_TOKENS = 2048;
const ANTHROPIC_REASON = "Estimated by AI.";

const SCORE_TOOL_NAME = "record_assignment_scores";

// Short keys on purpose: output tokens cost 5x input, and the key names are
// repeated for every entry. i = assignment number, t = type, imp/dif =
// importance/difficulty. Consequence isn't asked for — it comes from the
// type table (scoresForType), since these scores only break near-ties.
const SCORE_TOOL: Anthropic.Tool = {
    name: SCORE_TOOL_NAME,
    description: "Record one entry per assignment.",
    input_schema: {
        type: "object",
        properties: {
            r: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        i: { type: "integer" },
                        t: { type: "string", enum: [...ASSIGNMENT_TYPES] },
                        imp: { type: "integer" },
                        dif: { type: "integer" },
                    },
                    required: ["i", "t", "imp", "dif"],
                    additionalProperties: false,
                },
            },
        },
        required: ["r"],
        additionalProperties: false,
    },
    strict: true,
};

// Shared by both prompts: the type alone sets the time estimate
// (estimateMinutesByType), so a discussion read as an essay quadruples it.
const ASSIGNMENT_TYPE_GUIDE = `ASSIGNMENT TYPE: discussion = forum post or replies, even if it asks for written paragraphs; essay = standalone paper or written assignment submitted on its own; reflection = short personal response or journal; reading = read or watch material; practice = ungraded or low-stakes drills/worksheets; problem_set = set of problems; homework = other routine graded exercises; quiz = short timed check; test/exam = major timed assessment; project/presentation = multi-step deliverable or talk; lab = lab work or report. Use "other" only when nothing fits.`;

// Only tasks the server couldn't type from Canvas or the name reach this,
// so the type is the main job; imp/dif just break near-ties.
const SCORING_RUBRIC = `
Score each student assignment (line: "N. name | course | pts"). Judge each only from its own line.
${ASSIGNMENT_TYPE_GUIDE}
imp (1-10): academic weight vs normal coursework. 2 routine, 4 ordinary homework, 6 meaningful graded work, 8 substantial assessment, 10 final/capstone. Points are evidence, not a formula.
dif (1-10): effort for a capable student. 2 trivial, 4 familiar steps, 6 multi-step reasoning, 8 substantial writing/synthesis, 10 exceptional.
i = the line number.
`.trim();

// One compact line per task (vs the Ollama path's multi-line block).
function buildAssignmentLine(assignment: AssignmentInput, index: number): string {
    const points = assignment.pointsPossible != null ? ` | pts ${assignment.pointsPossible}` : "";
    return `${index + 1}. ${assignment.name} | ${assignment.course || "General"}${points}`;
}

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
                max_tokens: ANTHROPIC_MAX_TOKENS,
                temperature: 0,
                system: SCORING_RUBRIC,
                tools: [SCORE_TOOL],
                tool_choice: { type: "tool", name: SCORE_TOOL_NAME },
                messages: [
                    {
                        role: "user",
                        content: assignments.map(buildAssignmentLine).join("\n"),
                    },
                ],
            },
            { timeout: ANTHROPIC_TIMEOUT_MS }
        );
    } catch (error) {
        throw describeAnthropicError("assignment scoring", error);
    }

    logAnthropicUsage("assignment scoring", response);

    const input = getToolInput(response, SCORE_TOOL_NAME) as { r?: unknown };

    if (!Array.isArray(input.r)) {
        throw new Error("Anthropic scoring tool call did not contain a results array.");
    }

    const resultsByIndex = new Map<number, Record<string, unknown>>();

    for (const entry of input.r) {
        if (entry && typeof entry === "object" && typeof (entry as { i?: unknown }).i === "number") {
            resultsByIndex.set((entry as { i: number }).i, entry as Record<string, unknown>);
        }
    }

    // Per-entry degradation: one missing/malformed entry falls back for
    // just that assignment rather than discarding the whole batch.
    return assignments.map((assignment, i) => {
        const entry = resultsByIndex.get(i + 1);

        if (
            !entry ||
            typeof entry.imp !== "number" ||
            typeof entry.dif !== "number"
        ) {
            return fallbackAssignmentAnalysis(assignment);
        }

        const assignmentType = normalizeAssignmentType(entry.t);

        return {
            importance: clampScore(entry.imp),
            difficulty: clampScore(entry.dif),
            consequence: scoresForType(assignmentType).consequence,
            assignmentType,
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

${ASSIGNMENT_TYPE_GUIDE}


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
