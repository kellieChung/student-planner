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

const OLLAMA_TIMEOUT_MS = 25_000;
const ANTHROPIC_TIMEOUT_MS = 20_000;
const PREDICT_TOKENS_PER_TASK = 80;
const PREDICT_TOKENS_BASE = 100;
// A ceiling, not a spend — only generated tokens are billed.
const ANTHROPIC_MAX_TOKENS = 2048;

// Title + due date carry most of the matching signal; the description only
// disambiguates, so it's kept short — assignment context is the bulk of
// this call's input tokens.
const MAX_DESCRIPTION_LENGTH = 150;

// Below this, a containment match ("Read" inside "Read Chapter 1 and
// notes") is too generic to mean anything, so it's left to the model.
const MIN_CONTAINMENT_LENGTH = 8;

// matchingAssignmentNumber (not the raw assignment id) is deliberate: the
// 3B model reliably mangles a long retyped cuid — it's copying the wrong
// characters, not inventing a fake assignment. The prompt numbers
// candidates "ASSIGNMENT 1", "ASSIGNMENT 2", ...; asking for that small
// integer and resolving it to a real id server-side removes this failure
// class rather than just handling it after the fact.
const DUPLICATE_RESULT_ITEM_SCHEMA = {
    type: "object",
    properties: {
        index: { type: "integer" },
        isDuplicate: { type: "boolean" },
        matchingAssignmentNumber: { anyOf: [{ type: "integer" }, { type: "null" }] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["index", "isDuplicate", "matchingAssignmentNumber", "confidence"],
    additionalProperties: false,
} as const;

// Passed as Ollama's `format` — a real JSON Schema constrains token
// generation (grammar-based decoding) to this exact shape.
const DUPLICATE_CHECK_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        results: { type: "array", items: DUPLICATE_RESULT_ITEM_SCHEMA },
    },
    required: ["results"],
    additionalProperties: false,
} as const;

const DUPLICATE_TOOL_NAME = "record_duplicate_checks";

const DUPLICATE_TOOL: Anthropic.Tool = {
    name: DUPLICATE_TOOL_NAME,
    description: "Record one duplicate-check verdict per proposed task, in order.",
    input_schema: DUPLICATE_CHECK_RESPONSE_SCHEMA as unknown as Anthropic.Tool.InputSchema,
    strict: true,
};

// Deliberately biased toward false positives: a wrongly-flagged duplicate
// costs one click, a missed one silently doubles the student's work. The
// code below enforces the same bias (see uncertainDuplicateResult).
const INSTRUCTIONS = `
You check whether proposed student tasks are already covered by existing Canvas assignments in the SAME course.

DUPLICATE = the proposed task is included in, required by, or reasonably completed by finishing the assignment. Wording need not match, and the assignment may contain more work than the task — one part of a larger assignment is still a DUPLICATE.

Bias: a missed duplicate silently doubles the student's work; a false flag costs one click. When genuinely uncertain but there is plausible overlap in the actual work, mark DUPLICATE at low confidence. Use NOT DUPLICATE only when the work is clearly different (a different action or deliverable, or no connection). Same topic, chapter, material, or timing alone is not enough to be a duplicate.

Examples:
"Read Chapter 1" vs "Read Chapter 1 and complete notes" -> DUPLICATE, high
"Complete problems from section 2.1" vs "HW 2 - sections 1.3, 2.1, 2.2" -> DUPLICATE, high
"Prepare for the upcoming quiz" vs "Quiz 3: Chapters 4-5" -> DUPLICATE, low
"Write a response about Chapter 1" vs "Read Chapter 1" -> NOT DUPLICATE

Confidence: high = clearly the same work or explicitly included; medium = probably; low = weak but plausible overlap.

For each proposed task, pick the single best match from ITS OWN course only and give that ASSIGNMENT number (never an ID). No reasonable match -> isDuplicate false, matchingAssignmentNumber null, confidence low. "index" is the PROPOSED TASK number (1-based).
`.trim();

export type CanvasAssignment = {
    id: string;
    name: string;
    description: string | null;
    dueDate: string | null;
};

export type DuplicateCheckItem = {
    taskName: string;
    courseKey: string;
};

export type DuplicateCheckResult = {
    isDuplicate: boolean;
    matchingAssignmentId: string | null;
    confidence: "high" | "medium" | "low";
    reason: string;
    // "degraded" means this result came from `fallbackResult` — a genuine
    // failure (timeout, non-2xx, unparseable JSON, missing entry) — rather
    // than a real verdict; the caller needs this to show the user "we
    // couldn't check" instead of a false-looking "verified, no duplicate."
    // A verdict the model DID give us, even an uncertain or unresolvable
    // one, is "checked" — only an actual failure to get an answer is
    // "degraded".
    checkStatus: "checked" | "degraded";
};

function fallbackResult(reason: string): DuplicateCheckResult {
    return {
        isDuplicate: false,
        matchingAssignmentId: null,
        confidence: "low",
        reason,
        checkStatus: "degraded",
    };
}

// A genuine "checked" result the model gave us but that we can't point at
// a resolvable assignment for — NOT the same as `fallbackResult`. The
// model DID flag a duplicate, so reporting `isDuplicate: false` here would
// be exactly the silent-false-negative the bias exists to avoid.
// `checkStatus: "checked"` is deliberate — "degraded" would render this as
// a grey "unavailable" box instead of the amber possible-duplicate one.
function uncertainDuplicateResult(reason: string): DuplicateCheckResult {
    return {
        isDuplicate: true,
        matchingAssignmentId: null,
        confidence: "low",
        reason,
        checkStatus: "checked",
    };
}

// Nothing existed to compare against — a verified clean answer, not a
// failure.
function verifiedNoDuplicateResult(reason: string): DuplicateCheckResult {
    return {
        isDuplicate: false,
        matchingAssignmentId: null,
        confidence: "low",
        reason,
        checkStatus: "checked",
    };
}

function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Zero-token pre-pass. Only an EXACT normalized name match earns "high" —
// with auto-accept on, a high-confidence duplicate is suppressed without
// the user ever seeing it, so a looser containment match is capped at
// "medium", which always surfaces as a card.
function matchByName(
    taskName: string,
    assignments: CanvasAssignment[]
): DuplicateCheckResult | null {
    const task = normalizeName(taskName);

    if (!task) {
        return null;
    }

    const exact = assignments.find((a) => normalizeName(a.name) === task);

    if (exact) {
        return {
            isDuplicate: true,
            matchingAssignmentId: exact.id,
            confidence: "high",
            reason: "An existing Canvas assignment has the same name.",
            checkStatus: "checked",
        };
    }

    const contained = assignments.find((a) => {
        const assignment = normalizeName(a.name);
        const shorter = assignment.length < task.length ? assignment : task;

        // Whole-word containment only, so "read chapter 1" doesn't match
        // "read chapter 10".
        const paddedAssignment = ` ${assignment} `;
        const paddedTask = ` ${task} `;

        return (
            shorter.length >= MIN_CONTAINMENT_LENGTH &&
            (paddedAssignment.includes(paddedTask) || paddedTask.includes(paddedAssignment))
        );
    });

    if (contained) {
        return {
            isDuplicate: true,
            matchingAssignmentId: contained.id,
            confidence: "medium",
            reason: "This task may already be covered by an existing Canvas assignment.",
            checkStatus: "checked",
        };
    }

    return null;
}

type NumberedAssignment = CanvasAssignment & { courseKey: string };

function buildPromptBody(
    pending: DuplicateCheckItem[],
    numbered: NumberedAssignment[]
): string {
    const courseKeys = [...new Set(pending.map((item) => item.courseKey))];

    const taskList = pending
        .map((item, i) => `${i + 1}. [${item.courseKey}] ${item.taskName}`)
        .join("\n");

    const assignmentSections = courseKeys
        .map((courseKey) => {
            const lines = numbered
                .map((assignment, i) => ({ assignment, number: i + 1 }))
                .filter(({ assignment }) => assignment.courseKey === courseKey)
                .map(({ assignment, number }) => {
                    const description = assignment.description
                        ? truncateText(stripHtml(assignment.description), MAX_DESCRIPTION_LENGTH)
                        : "";

                    return `ASSIGNMENT ${number}: ${assignment.name} (due ${assignment.dueDate ?? "none"})${
                        description ? ` — ${description}` : ""
                    }`;
                });

            return `COURSE: ${courseKey}\n${lines.join("\n")}`;
        })
        .join("\n\n");

    return `PROPOSED TASKS:\n${taskList}\n\nEXISTING CANVAS ASSIGNMENTS:\n${assignmentSections}`;
}

async function callAnthropic(promptBody: string): Promise<unknown[]> {
    let response: Anthropic.Message;

    try {
        response = await getAnthropicClient().messages.create(
            {
                model: ANTHROPIC_MODEL,
                max_tokens: ANTHROPIC_MAX_TOKENS,
                temperature: 0,
                system: INSTRUCTIONS,
                tools: [DUPLICATE_TOOL],
                tool_choice: { type: "tool", name: DUPLICATE_TOOL_NAME },
                messages: [{ role: "user", content: promptBody }],
            },
            { timeout: ANTHROPIC_TIMEOUT_MS }
        );
    } catch (error) {
        throw describeAnthropicError("duplicate check", error);
    }

    logAnthropicUsage("duplicate check", response);

    const input = getToolInput(response, DUPLICATE_TOOL_NAME) as { results?: unknown };

    if (!Array.isArray(input.results)) {
        throw new Error("Anthropic duplicate-check tool call did not contain a results array.");
    }

    return input.results;
}

async function callOllama(
    pending: DuplicateCheckItem[],
    promptBody: string
): Promise<unknown[]> {
    let response: Response;

    try {
        response = await fetch(OLLAMA_CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a strict JSON classification system. Return only the requested JSON object.",
                    },
                    {
                        role: "user",
                        content: `${INSTRUCTIONS}\n\n${promptBody}\n\nReturn ONLY JSON of the form {"results": [{"index": 1, "isDuplicate": true, "matchingAssignmentNumber": 2, "confidence": "high"}]}, one entry per proposed task.`,
                    },
                ],
                stream: false,
                format: DUPLICATE_CHECK_RESPONSE_SCHEMA,
                options: {
                    temperature: 0,
                    num_ctx: OLLAMA_NUM_CTX,
                    num_predict: PREDICT_TOKENS_BASE + PREDICT_TOKENS_PER_TASK * pending.length,
                },
            }),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
                `Ollama duplicate check timed out after ${OLLAMA_TIMEOUT_MS / 1000} seconds.`
            );
        }

        throw error;
    }

    if (!response.ok) {
        throw new Error(
            `Ollama duplicate check failed: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    // "length" means Ollama hit num_predict and cut the response off
    // mid-object (the fix is a bigger token budget); "stop" with still-
    // malformed content instead points at model capability.
    console.log(
        `🔎 Duplicate-check Ollama call: done_reason=${data.done_reason ?? "unknown"} eval_count=${data.eval_count ?? "unknown"}`
    );

    const content =
        typeof data.message?.content === "string" ? data.message.content.trim() : "";

    let parsed: unknown;

    try {
        parsed = JSON.parse(content);
    } catch {
        console.error("❌ Invalid duplicate-check JSON:", content);
        throw new Error("Ollama returned invalid duplicate-check JSON.");
    }

    const results = (parsed as { results?: unknown } | null)?.results;

    if (!Array.isArray(results)) {
        throw new Error("Ollama response did not contain a duplicate-check results array.");
    }

    return results;
}

// Shared by both providers so the checked/degraded semantics and the
// false-positive bias can't drift between them. Per-entry degradation,
// not a whole-batch throw: one malformed entry degrades just that task.
function toDuplicateResults(
    pending: DuplicateCheckItem[],
    rawResults: unknown[],
    numbered: NumberedAssignment[]
): DuplicateCheckResult[] {
    const resultsByIndex = new Map<number, Record<string, unknown>>();

    for (const entry of rawResults) {
        if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { index?: unknown }).index === "number"
        ) {
            resultsByIndex.set((entry as { index: number }).index, entry as Record<string, unknown>);
        }
    }

    return pending.map((item, i) => {
        // A dropped/duplicated/off-by-one "index" shouldn't discard an
        // otherwise-valid entry — fall back to the same array position.
        const indexed = resultsByIndex.get(i + 1);

        const result =
            indexed ??
            (rawResults[i] && typeof rawResults[i] === "object"
                ? (rawResults[i] as Record<string, unknown>)
                : undefined);

        if (!result) {
            console.error(`⚠️ Duplicate-check response is missing an entry for "${item.taskName}".`);

            return fallbackResult(
                "The AI response didn't include a verdict for this task."
            );
        }

        const confidenceValid =
            result.confidence === "high" ||
            result.confidence === "medium" ||
            result.confidence === "low";

        if (
            typeof result.isDuplicate !== "boolean" ||
            !(result.matchingAssignmentNumber === null || typeof result.matchingAssignmentNumber === "number") ||
            !confidenceValid
        ) {
            console.error(`⚠️ Invalid duplicate-check entry for "${item.taskName}".`, result);

            return fallbackResult("The AI response was malformed for this task.");
        }

        if (!result.isDuplicate) {
            return {
                isDuplicate: false,
                matchingAssignmentId: null,
                confidence: result.confidence as DuplicateCheckResult["confidence"],
                reason: "No existing Canvas assignment appears to cover this task.",
                checkStatus: "checked",
            };
        }

        // A flagged duplicate whose number doesn't resolve to an assignment
        // in the task's own course keeps its flag (see
        // uncertainDuplicateResult) rather than being silently dropped.
        const matched =
            typeof result.matchingAssignmentNumber === "number"
                ? numbered[result.matchingAssignmentNumber - 1]
                : undefined;

        if (!matched || matched.courseKey !== item.courseKey) {
            console.error(`⚠️ Duplicate flagged for "${item.taskName}" without a resolvable same-course match.`, result);

            return uncertainDuplicateResult(
                "The AI thinks this may already exist but couldn't identify which assignment."
            );
        }

        return {
            isDuplicate: true,
            matchingAssignmentId: matched.id,
            confidence: result.confidence as DuplicateCheckResult["confidence"],
            reason: "This task may already be covered by an existing Canvas assignment.",
            checkStatus: "checked",
        };
    });
}

/**
 * Checks every proposed task from one extraction batch (possibly spanning
 * several announcements and courses) in at most ONE model call — each
 * course's assignments are listed once, and each task is only allowed to
 * match within its own course. Exact/near name matches and tasks from
 * courses with nothing to compare against are resolved without any model
 * call. Never throws: a total failure degrades just the tasks that needed
 * the model. Returns results in the same order as `items`.
 */
export async function findDuplicateTasksForBatch(
    items: DuplicateCheckItem[],
    assignmentsByCourse: Map<string, CanvasAssignment[]>
): Promise<DuplicateCheckResult[]> {
    const results: (DuplicateCheckResult | null)[] = items.map((item) => {
        const assignments = assignmentsByCourse.get(item.courseKey) ?? [];

        if (assignments.length === 0) {
            return verifiedNoDuplicateResult(
                "No nearby Canvas assignments were available to compare against."
            );
        }

        return matchByName(item.taskName, assignments);
    });

    const pendingIndexes = results
        .map((result, i) => (result === null ? i : -1))
        .filter((i) => i !== -1);

    if (pendingIndexes.length === 0) {
        return results as DuplicateCheckResult[];
    }

    const pending = pendingIndexes.map((i) => items[i]);

    const numbered: NumberedAssignment[] = [...new Set(pending.map((item) => item.courseKey))].flatMap(
        (courseKey) =>
            (assignmentsByCourse.get(courseKey) ?? []).map((assignment) => ({ ...assignment, courseKey }))
    );

    const promptBody = buildPromptBody(pending, numbered);

    let pendingResults: DuplicateCheckResult[];

    try {
        const rawResults = isAnthropicEnabled()
            ? await callAnthropic(promptBody)
            : await callOllama(pending, promptBody);

        pendingResults = toDuplicateResults(pending, rawResults, numbered);
    } catch (error) {
        console.error("❌ Duplicate check failed:", error);

        pendingResults = pending.map(() => fallbackResult("Duplicate checking failed."));
    }

    pendingIndexes.forEach((itemIndex, i) => {
        results[itemIndex] = pendingResults[i];
    });

    return results as DuplicateCheckResult[];
}
