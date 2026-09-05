const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:3b-instruct";

const OLLAMA_TIMEOUT_MS = 25_000;
const PREDICT_TOKENS_PER_TASK = 80;
const PREDICT_TOKENS_BASE = 100;

type CanvasAssignment = {
    id: string;
    name: string;
    description: string | null;
    dueDate: string | null;
};

type DuplicateCheckResult = {
    isDuplicate: boolean;
    matchingAssignmentId: string | null;
    confidence: "high" | "medium" | "low";
    reason: string;
};

/**
 * Remove HTML from Canvas assignment descriptions.
 *
 * Canvas descriptions can contain enormous amounts of HTML:
 * links, styling, metadata, embedded files, etc.
 *
 * The duplicate checker does not need any of that.
 */
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Keep assignment descriptions short.
 *
 * The duplicate checker mainly needs enough context to understand
 * what the assignment actually asks the student to do.
 */
function simplifyDescription(
    description: string | null
): string {
    if (!description) {
        return "";
    }

    const cleaned = stripHtml(description);

    const MAX_DESCRIPTION_LENGTH = 500;

    if (cleaned.length <= MAX_DESCRIPTION_LENGTH) {
        return cleaned;
    }

    return (
        cleaned.slice(0, MAX_DESCRIPTION_LENGTH).trim() +
        "..."
    );
}

/**
 * Build the small amount of assignment information that
 * gets sent to Ollama.
 */
function buildAssignmentContext(
    assignments: CanvasAssignment[]
): string {
    return assignments
        .map((assignment, index) => {
            const description =
                simplifyDescription(
                    assignment.description
                );

            return [
                `ASSIGNMENT ${index + 1}`,
                `ID: ${assignment.id}`,
                `TITLE: ${assignment.name}`,
                `DUE: ${assignment.dueDate ?? "No due date"}`,
                `DESCRIPTION: ${
                    description ||
                    "No description available."
                }`,
            ].join("\n");
        })
        .join("\n\n");
}

function fallbackResult(reason: string): DuplicateCheckResult {
    return {
        isDuplicate: false,
        matchingAssignmentId: null,
        confidence: "low",
        reason,
    };
}

/**
 * Checks a batch of proposed task names (all from the SAME announcement,
 * so they already share the same nearby-assignment context) against
 * existing Canvas assignments in a single Ollama call, instead of one call
 * per task. Returns results in the same order as proposedTaskNames.
 */
export async function findDuplicateTasks(
    proposedTaskNames: string[],
    assignments: CanvasAssignment[]
): Promise<DuplicateCheckResult[]> {
    if (proposedTaskNames.length === 0) {
        return [];
    }

    if (assignments.length === 0) {
        return proposedTaskNames.map(() =>
            fallbackResult(
                "No nearby Canvas assignments were available to compare against."
            )
        );
    }

    const assignmentContext =
        buildAssignmentContext(assignments);

    const taskList = proposedTaskNames
        .map((name, index) => `${index + 1}. ${name}`)
        .join("\n");

    const prompt = `
Determine whether EACH of the following proposed student tasks is already covered by one of the existing Canvas assignments below. Evaluate each proposed task independently.

Be SENSITIVE: this is a student-facing suggestion, so prefer a false positive over a false negative when there is reasonable evidence of overlap.

A DUPLICATE means the proposed task is included in, required by, or reasonably completed by finishing the Canvas assignment.

The proposed task does NOT need to have the same wording as the assignment.

IMPORTANT:
A Canvas assignment can contain MORE work than the proposed task.
If the proposed task is one part of that assignment, it is a DUPLICATE.

Examples:

Proposed: "Read Chapter 1"
Canvas: "Read Chapter 1 and complete notes"
=> DUPLICATE

Proposed: "Complete problems from section 2.1"
Canvas: "HW 2 - Complete problems from sections 1.3, 1.4, 2.1, and 2.2"
=> DUPLICATE

Proposed: "Post discussion response"
Canvas: "DISCUSS: Chapter 1 Initial Post"
=> DUPLICATE

Proposed: "Write a response about Chapter 1"
Canvas: "Read Chapter 1"
=> NOT DUPLICATE

Proposed: "Read Chapter 1"
Canvas: "Write a response about Chapter 1"
=> NOT DUPLICATE

Do NOT mark something duplicate just because it:
- is about the same topic or chapter
- uses the same book or material
- has similar wording
- occurs at the same time
- is generally related

The actual student work must overlap.

DECISION:
If completing the Canvas assignment would reasonably mean the proposed task is also completed -> DUPLICATE.

If the relationship is uncertain but there is reasonable evidence the proposed task is part of the assignment -> DUPLICATE with MEDIUM confidence.

If they only share a topic/material but require different work -> NOT DUPLICATE.

Choose the SINGLE best matching assignment for each proposed task.

CONFIDENCE:
HIGH = clearly the same work or explicitly included.
MEDIUM = probably the same work or probably included, but somewhat ambiguous.
LOW = weak/no meaningful overlap.

PROPOSED TASKS:
${taskList}

EXISTING CANVAS ASSIGNMENTS:
${assignmentContext}

Return ONLY this JSON, with exactly one entry per proposed task above, in this exact shape:

{
  "results": [
    {
      "index": 1,
      "isDuplicate": true,
      "matchingAssignmentId": "assignment-id",
      "confidence": "high"
    }
  ]
}

If there is no reasonable match for a proposed task, use:

{ "index": N, "isDuplicate": false, "matchingAssignmentId": null, "confidence": "low" }

"index" must match the PROPOSED TASKS number above (1-based).
No markdown.
No explanation.
No extra text.
No additional keys.
`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, OLLAMA_TIMEOUT_MS);

    let response: Response;

    try {
        response = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a strict JSON classification system. Return only the requested JSON object.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                stream: false,
                options: {
                    temperature: 0,
                    num_predict:
                        PREDICT_TOKENS_BASE +
                        PREDICT_TOKENS_PER_TASK * proposedTaskNames.length,
                },
            }),
            signal: controller.signal,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.name === "AbortError"
        ) {
            throw new Error(
                `Ollama duplicate check timed out after ${
                    OLLAMA_TIMEOUT_MS / 1000
                } seconds.`
            );
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(
            `Ollama duplicate check failed: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    const content =
        typeof data.message?.content === "string"
            ? data.message.content.trim()
            : "";

    if (!content) {
        throw new Error(
            "Ollama returned no duplicate-check content."
        );
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(content);
    } catch {
        console.error(
            "❌ Invalid duplicate-check JSON:",
            content
        );

        throw new Error(
            "Ollama returned invalid duplicate-check JSON."
        );
    }

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        !Array.isArray((parsed as { results?: unknown }).results)
    ) {
        console.error(
            "❌ Invalid duplicate-check structure:",
            parsed
        );

        throw new Error(
            "Ollama response did not contain a duplicate-check results array."
        );
    }

    const resultsByIndex = new Map<number, Record<string, unknown>>();

    for (const entry of (parsed as { results: unknown[] }).results) {
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

    return proposedTaskNames.map((_, i) => {
        const result = resultsByIndex.get(i + 1);

        if (!result) {
            console.error(
                `❌ Duplicate-check response is missing an entry for proposed task ${i + 1}:`,
                parsed
            );

            throw new Error(
                `Ollama duplicate-check response is missing an entry for proposed task ${i + 1}.`
            );
        }

        const isDuplicate =
            typeof result.isDuplicate === "boolean";

        const matchingAssignmentId =
            result.matchingAssignmentId === null ||
            typeof result.matchingAssignmentId === "string";

        const confidence =
            result.confidence === "high" ||
            result.confidence === "medium" ||
            result.confidence === "low";

        if (
            !isDuplicate ||
            !matchingAssignmentId ||
            !confidence
        ) {
            console.error(
                "❌ Invalid duplicate-check structure:",
                result
            );

            throw new Error(
                "Ollama returned an invalid duplicate-check structure."
            );
        }

        if (
            result.isDuplicate === false &&
            result.matchingAssignmentId !== null
        ) {
            console.error(
                "❌ Duplicate checker returned an assignment ID while saying there is no duplicate:",
                result
            );

            throw new Error(
                "Ollama returned an inconsistent duplicate-check result."
            );
        }

        if (
            result.isDuplicate === true &&
            result.matchingAssignmentId === null
        ) {
            console.error(
                "❌ Duplicate checker returned true without an assignment ID:",
                result
            );

            throw new Error(
                "Ollama returned an inconsistent duplicate-check result."
            );
        }

        const matchingAssignment =
            result.matchingAssignmentId
                ? assignments.find(
                      (assignment) =>
                          assignment.id ===
                          result.matchingAssignmentId
                  )
                : undefined;

        if (
            result.isDuplicate &&
            !matchingAssignment
        ) {
            console.error(
                "❌ Ollama returned an assignment ID that does not exist in the provided assignments:",
                result
            );

            throw new Error(
                "Ollama returned an unknown assignment ID."
            );
        }

        const reason = result.isDuplicate
            ? "This task may already be covered by an existing Canvas assignment."
            : "No existing Canvas assignment appears to cover this task.";

        return {
            isDuplicate: result.isDuplicate as boolean,
            matchingAssignmentId:
                result.matchingAssignmentId as string | null,
            confidence:
                result.confidence as "high" | "medium" | "low",
            reason,
        };
    });
}
