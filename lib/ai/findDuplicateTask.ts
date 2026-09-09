import { OLLAMA_CHAT_URL, OLLAMA_MODEL, OLLAMA_NUM_CTX } from "@/lib/ollamaConfig";
import { stripHtml, truncateText } from "@/lib/htmlText";

const OLLAMA_TIMEOUT_MS = 25_000;
const PREDICT_TOKENS_PER_TASK = 80;
const PREDICT_TOKENS_BASE = 100;
const MAX_DESCRIPTION_LENGTH = 500;

// Passed as Ollama's `format` instead of the bare `"json"` flag — a real
// JSON Schema constrains token generation (grammar-based decoding) to this
// exact shape, a stronger guarantee than "please return JSON" for a 3B
// model. Kept in sync with the "Return ONLY this JSON..." shape described
// in the prompt below.
// matchingAssignmentNumber (not the raw assignment id) is deliberate: the
// 3B model reliably mangles a long retyped cuid (e.g. "cmti0swc0082b8uxnr1v4yn"
// vs. the real "cmti0sqw90007b8uu56fnff5b") — it's copying the wrong
// characters, not inventing a fake assignment. The prompt already numbers
// candidates as "ASSIGNMENT 1", "ASSIGNMENT 2", ... — asking for that small
// integer instead and resolving it to a real id server-side (see
// buildAssignmentContext/findDuplicateTasks below) removes this failure
// class rather than just handling it after the fact.
const DUPLICATE_CHECK_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        results: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    index: { type: "integer" },
                    isDuplicate: { type: "boolean" },
                    matchingAssignmentNumber: { type: ["integer", "null"] },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["index", "isDuplicate", "matchingAssignmentNumber", "confidence"],
            },
        },
    },
    required: ["results"],
} as const;

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
    // "degraded" means this result came from `fallbackResult` — a genuine
    // failure (timeout, non-2xx, unparseable JSON, missing entry) — rather
    // than a real verdict; the caller needs this to show the user "we
    // couldn't check" instead of a false-looking "verified, no duplicate."
    // A verdict the model DID give us, even an uncertain or unresolvable
    // one (see `uncertainDuplicateResult`/`verifiedNoDuplicateResult`
    // below), is "checked" — only an actual failure to get an answer is
    // "degraded".
    checkStatus: "checked" | "degraded";
};

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

    return truncateText(stripHtml(description), MAX_DESCRIPTION_LENGTH);
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
        checkStatus: "degraded",
    };
}

// A genuine "checked" result the model gave us but that we can't point at
// a resolvable assignment id for — NOT the same as `fallbackResult`, which
// means "we couldn't check at all". This is what the false-positive bias
// (see the prompt below) actually requires in code: the model DID flag a
// duplicate, so silently reporting `isDuplicate: false` here would be
// exactly the silent-false-negative failure mode the bias is meant to
// avoid. `checkStatus: "checked"` is deliberate — "degraded" would make the
// route render this as a grey "unavailable" box instead of the amber
// possible-duplicate one, erasing the flag this exists to preserve.
function uncertainDuplicateResult(reason: string): DuplicateCheckResult {
    return {
        isDuplicate: true,
        matchingAssignmentId: null,
        confidence: "low",
        reason,
        checkStatus: "checked",
    };
}

// Mirror image of the above: nothing existed to compare against, which is
// a verified clean answer, not a failure — `checkStatus: "checked"`, not
// "degraded".
function verifiedNoDuplicateResult(reason: string): DuplicateCheckResult {
    return {
        isDuplicate: false,
        matchingAssignmentId: null,
        confidence: "low",
        reason,
        checkStatus: "checked",
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
            verifiedNoDuplicateResult(
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

Be STRONGLY SENSITIVE toward flagging duplicates. The two mistakes are NOT equally costly:
- A wrongly-flagged duplicate (false positive) costs the student one glance and one click to dismiss.
- A missed real duplicate (false negative) silently gives the student two copies of the same work cluttering their planner, with nothing pointing it out.
Because of this, when you are genuinely uncertain whether a proposed task overlaps with a Canvas assignment, mark it as a DUPLICATE (at LOW confidence) rather than NOT DUPLICATE. Reserve NOT DUPLICATE for cases where the work is clearly, obviously different — not merely "not perfectly certain."

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

Proposed: "Prepare for the upcoming quiz"
Canvas: "Quiz 3: Chapters 4-5"
=> DUPLICATE (low confidence) — the wording is vague and it's not a certain match, but there's plausible overlap, so flag it rather than staying silent.

Proposed: "Write a response about Chapter 1"
Canvas: "Read Chapter 1"
=> NOT DUPLICATE — clearly different actions (writing vs. reading), not just uncertain.

Proposed: "Read Chapter 1"
Canvas: "Write a response about Chapter 1"
=> NOT DUPLICATE — same reasoning, reversed.

Do NOT mark something duplicate just because it:
- is about the same topic or chapter
- uses the same book or material
- has similar wording
- occurs at the same time
- is generally related

These are guardrails against obviously wrong matches (topic overlap alone) — they are NOT a reason to default to NOT DUPLICATE whenever there's still genuine, if imperfect, evidence that the actual work overlaps.

DECISION:
If completing the Canvas assignment would reasonably mean the proposed task is also completed -> DUPLICATE.

If the relationship is uncertain but there is any plausible evidence the proposed task is part of the assignment -> DUPLICATE, at MEDIUM or LOW confidence depending on how strong that evidence is. Do not round this down to NOT DUPLICATE just because you're not fully sure.

Only use NOT DUPLICATE when the work is clearly and obviously different — a different action, a different deliverable, or no discernible connection at all.

Choose the SINGLE best matching assignment for each proposed task.

CONFIDENCE:
HIGH = clearly the same work or explicitly included.
MEDIUM = probably the same work or probably included, but somewhat ambiguous.
LOW = genuinely uncertain, weak overlap — still enough of a hint to flag as a duplicate rather than silently miss it.

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
      "matchingAssignmentNumber": 2,
      "confidence": "high"
    }
  ]
}

"matchingAssignmentNumber" is the ASSIGNMENT number above (e.g. 2 for "ASSIGNMENT 2"), NOT its ID — always the number, never the ID text.

If there is no reasonable match for a proposed task, use:

{ "index": N, "isDuplicate": false, "matchingAssignmentNumber": null, "confidence": "low" }

"index" must match the PROPOSED TASKS number above (1-based).
No markdown.
No explanation.
No extra text.
No additional keys.
`;

    let response: Response;

    try {
        response = await fetch(OLLAMA_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
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
                        content: prompt,
                    },
                ],
                stream: false,
                format: DUPLICATE_CHECK_RESPONSE_SCHEMA,
                options: {
                    temperature: 0,
                    num_ctx: OLLAMA_NUM_CTX,
                    num_predict:
                        PREDICT_TOKENS_BASE +
                        PREDICT_TOKENS_PER_TASK * proposedTaskNames.length,
                },
            }),
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
    }

    if (!response.ok) {
        throw new Error(
            `Ollama duplicate check failed: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    // "length" means Ollama hit num_predict and cut the response off
    // mid-object (the fix is a bigger token budget); "stop" with still-
    // malformed content instead points at model capability. Distinguishing
    // these was previously impossible from the caller's side.
    console.log(
        `🔎 Duplicate-check Ollama call: done_reason=${data.done_reason ?? "unknown"} eval_count=${data.eval_count ?? "unknown"}`
    );

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

    // Per-entry degradation, not a whole-batch throw: this batches 1-3
    // tasks from the SAME announcement, so one malformed/inconsistent
    // entry used to throw and make the caller discard every task's
    // result in that announcement — including tasks whose own entry was
    // perfectly correct. Only genuine total failures (handled above:
    // fetch error, non-2xx, unparseable JSON, missing `results` array)
    // still throw; a per-entry problem degrades just that one entry to
    // "not a duplicate" instead.
    const resultsArray = (parsed as { results: unknown[] }).results;

    return proposedTaskNames.map((_, i) => {
        const indexed = resultsByIndex.get(i + 1);

        // A dropped/duplicated/off-by-one "index" shouldn't discard an
        // otherwise-valid entry — fall back to the same array position
        // before giving up on this task.
        const positional =
            !indexed && resultsArray[i] && typeof resultsArray[i] === "object"
                ? (resultsArray[i] as Record<string, unknown>)
                : undefined;

        const result = indexed ?? positional;

        if (!result) {
            console.error(
                `⚠️ Duplicate-check response is missing an entry for proposed task ${i + 1}; treating as not a duplicate.`,
                parsed
            );

            return fallbackResult(
                "The AI response didn't include a verdict for this task, so it was treated as not a duplicate."
            );
        }

        const isDuplicateValid =
            typeof result.isDuplicate === "boolean";

        const matchingAssignmentNumberValid =
            result.matchingAssignmentNumber === null ||
            typeof result.matchingAssignmentNumber === "number";

        const confidenceValid =
            result.confidence === "high" ||
            result.confidence === "medium" ||
            result.confidence === "low";

        if (
            !isDuplicateValid ||
            !matchingAssignmentNumberValid ||
            !confidenceValid
        ) {
            console.error(
                `⚠️ Invalid duplicate-check structure for proposed task ${i + 1}; treating as not a duplicate.`,
                result
            );

            return fallbackResult(
                "The AI response was malformed for this task, so it was treated as not a duplicate."
            );
        }

        // A claimed duplicate needs a real, known assignment number to
        // point at as "the match" — but the model DID flag this as a
        // duplicate, so per the false-positive bias below, that verdict
        // itself is preserved (isDuplicate: true, low confidence, no
        // assignment pointer) rather than silently discarded. Discarding a
        // real duplicate verdict just because its pointer didn't resolve is
        // exactly the silent-false-negative failure mode the bias exists
        // to avoid.
        if (
            result.isDuplicate === true &&
            result.matchingAssignmentNumber === null
        ) {
            console.error(
                `⚠️ Duplicate checker returned true without an assignment number for proposed task ${i + 1}; preserving the duplicate flag without a match.`,
                result
            );

            return uncertainDuplicateResult(
                "The AI thinks this may already exist but couldn't identify which assignment."
            );
        }

        // 1-based ASSIGNMENT number -> real assignment, resolved
        // server-side (see buildAssignmentContext) — the model only ever
        // has to copy a small integer it can see rather than retype a
        // ~25-character opaque id, which is what was actually causing the
        // "unknown assignment ID" failures below.
        const matchingAssignment =
            typeof result.matchingAssignmentNumber === "number"
                ? assignments[result.matchingAssignmentNumber - 1]
                : undefined;

        if (
            result.isDuplicate &&
            !matchingAssignment
        ) {
            console.error(
                `⚠️ Duplicate checker returned an out-of-range assignment number for proposed task ${i + 1}; preserving the duplicate flag without a match.`,
                result
            );

            return uncertainDuplicateResult(
                "The AI flagged this as a duplicate but referenced an assignment that couldn't be found."
            );
        }

        // isDuplicate: false with a stray non-null number is a harmless
        // inconsistency (the number is simply unused) — normalize it
        // rather than degrading the whole entry over it.
        const reason = result.isDuplicate
            ? "This task may already be covered by an existing Canvas assignment."
            : "No existing Canvas assignment appears to cover this task.";

        return {
            isDuplicate: result.isDuplicate as boolean,
            matchingAssignmentId: result.isDuplicate
                ? matchingAssignment!.id
                : null,
            confidence:
                result.confidence as "high" | "medium" | "low",
            reason,
            checkStatus: "checked",
        };
    });
}
