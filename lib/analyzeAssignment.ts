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

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:3b-instruct";
const OLLAMA_TIMEOUT_MS = 25_000;

// Tokens budgeted per assignment in the batch response, plus a fixed
// overhead for JSON structure/formatting.
const PREDICT_TOKENS_PER_ASSIGNMENT = 200;
const PREDICT_TOKENS_BASE = 100;

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
 * Analyzes a batch of assignments in a single Ollama call rather than one
 * call per assignment — each call resends the full rubric/instructions, so
 * batching cuts that fixed per-call cost proportionally. A malformed or
 * missing entry for any one assignment fails the whole batch (caller falls
 * back to the deterministic heuristic for all of them); this is a
 * deliberate simplicity/robustness tradeoff for a reasonably small batch
 * size, not a partial-recovery attempt.
 */
export async function analyzeAssignments(
    assignments: AssignmentInput[]
): Promise<AssignmentAnalysis[]> {
    if (assignments.length === 0) {
        return [];
    }

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    let response: Response;

    try {
        response = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                stream: false,
                options: {
                    num_predict:
                        PREDICT_TOKENS_BASE +
                        PREDICT_TOKENS_PER_ASSIGNMENT * assignments.length,
                },
            }),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
                `Ollama request timed out after ${OLLAMA_TIMEOUT_MS / 1000} seconds.`
            );
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }

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
