import Anthropic from "@anthropic-ai/sdk";
import { Announcement } from "@/types/announcement";
import { ProposedTask } from "@/types/proposedTask";
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
import { computeSuggestionKey } from "@/lib/suggestionKey";

// Bumped from 25s: a batch of real-prose announcements under concurrency
// legitimately needs more headroom than a quick structured-classification
// call — a safety margin on top of (not a substitute for) MAX_MESSAGE_LENGTH
// actually bounding the work per call.
const OLLAMA_TIMEOUT_MS = 35_000;

// Bumped from 20s: a real batch call has been observed producing 1,000+
// output tokens (a large multi-task announcement), which can legitimately
// approach or exceed 20s — a timeout here throws away the whole batch and
// triggers the expensive bisection retry below for a call that was never
// actually stuck, just slow.
const ANTHROPIC_TIMEOUT_MS = 45_000;

const PREDICT_TOKENS_PER_ANNOUNCEMENT = 250;
const PREDICT_TOKENS_BASE = 100;

// A ceiling, not a spend — only actually-generated tokens are billed, so
// this is sized generously to avoid a batch's tool-call output getting cut
// off mid-object rather than tuned tightly against a token estimate.
const ANTHROPIC_MAX_TOKENS = 4096;

// Ollama's OLLAMA_NUM_CTX (8192) bounds prompt+RULES+output combined for a
// batch of OLLAMA_BATCH_SIZE (5) — this cap is now mostly a safety
// net, since extractActionableHtml below already keeps typical content
// well under it.
const OLLAMA_MAX_MESSAGE_LENGTH = 3000;

// Claude Haiku's cost ($1/MTok input) makes this cheap even as a rarely-hit
// safety net; sized to comfortably cover the fallback (all-prose,
// no-actionable-match) path without needing an aggressive cap.
const ANTHROPIC_MAX_MESSAGE_LENGTH = 4000;

// The fixed per-call overhead (RULES + tool schema, ~1.2k tokens) is shared
// across the batch, so Haiku gets twice Ollama's batch size — its 200k
// context has room; the local 3B model's OLLAMA_NUM_CTX (8192) doesn't.
const ANTHROPIC_BATCH_SIZE = 10;
const OLLAMA_BATCH_SIZE = 5;

export function getAnnouncementBatchSize(): number {
    return isAnthropicEnabled() ? ANTHROPIC_BATCH_SIZE : OLLAMA_BATCH_SIZE;
}

// `ok: false` means the model never gave a usable answer for this
// announcement (malformed/missing entry, or a failed single-announcement
// call) — distinct from `ok: true` with zero tasks, a genuine "nothing to
// do." The route only marks an announcement as analyzed on `ok: true`, so a
// failure is retried on the next pass instead of being silently skipped
// forever.
export type AnnouncementAnalysisResult = {
    tasks: ProposedTask[];
    ok: boolean;
};

// Reused as a relevance signal below — not classification vocabulary, just
// "does this block plausibly describe something a student needs to do."
// Deliberately broad (false positives are cheap; dropping a real
// assignment isn't) and kept independent of any specific LMS's markup,
// since not every teacher's announcement uses Canvas's assignment-link
// annotations or lays calendars out as tables.
const ACTIONABLE_KEYWORDS =
    /\b(read|reading|watch|watching|video|quiz|quizzes|exam|exams|test|tests|homework|hw|complete|completed|submit|submission|discuss|discussion|due|deadline|prepare|preparation|prep|turn in|worksheet|worksheets|chapter|chapters|pp\.|assignment|assignments|project|projects|essay|essays|presentation|presentations|problem set|pset|lab|labs|reflect|reflection|post|response|responses|respond|annotate|annotation|translate|translation|study guide)\b/i;

// Canvas's rich-content editor tags links to assignments/quizzes/
// discussions/pages with this attribute when present — a bonus, stronger
// signal on top of the keyword match above, not a requirement (plenty of
// real announcements have neither tables nor these attributes).
const ACTIONABLE_LINK_TYPES = ["assignments", "quizzes", "discussions", "wikiPages"];

function splitIntoBlocks(html: string): string[] {
    return html.match(/<(p|li|td|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
}

function isActionableBlock(block: string): boolean {
    if (/<h[1-6]\b/i.test(block)) {
        return true; // headings are cheap to keep and give the model orientation
    }

    const typePattern = ACTIONABLE_LINK_TYPES.join("|");

    if (new RegExp(`data-course-type="(?:${typePattern})"`, "i").test(block)) {
        return true;
    }

    return ACTIONABLE_KEYWORDS.test(stripHtml(block));
}

// Only engages once the message is already too long to send as-is — a
// typical short announcement passes through completely untouched, so a
// keyword the list didn't anticipate can never cause it to lose content.
// Falls back to the full text if filtering finds nothing actionable at
// all, rather than risking sending an empty/near-empty message.
function extractActionableHtml(html: string, maxLength: number): string {
    const fullStripped = stripHtml(html);

    if (fullStripped.length <= maxLength) {
        return fullStripped;
    }

    const kept = splitIntoBlocks(html).filter(isActionableBlock);
    const filteredStripped = stripHtml(kept.join("\n"));

    return filteredStripped.length > 0 ? filteredStripped : fullStripped;
}

type AIExtractedTask = {
    name: string;
    description: string;
    evidence: string;
    dueText: string | null;
    confidence: "high" | "medium" | "low";
};

const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

// A raw extracted task's fields are unchecked JSON straight from the
// model — validate/coerce each field independently rather than casting,
// so one malformed field (e.g. a numeric `confidence`) degrades just that
// field instead of silently propagating a wrong-shaped value to the UI. A
// task with no usable `name` is dropped entirely since it has nothing to
// show the user. Kept even for the Anthropic path (whose strict tool
// schema already guarantees shape) as defense-in-depth — the schema
// guarantees structure, not that a required string isn't empty/garbage.
function toValidatedTask(raw: unknown): AIExtractedTask | null {
    if (typeof raw !== "object" || raw === null) {
        return null;
    }

    const entry = raw as Record<string, unknown>;

    const name = typeof entry.name === "string" ? entry.name.trim() : "";

    if (!name) {
        return null;
    }

    return {
        name,
        description: typeof entry.description === "string" ? entry.description : "",
        evidence: typeof entry.evidence === "string" ? entry.evidence : "",
        dueText: typeof entry.dueText === "string" ? entry.dueText : null,
        confidence: CONFIDENCE_LEVELS.includes(entry.confidence as (typeof CONFIDENCE_LEVELS)[number])
            ? (entry.confidence as (typeof CONFIDENCE_LEVELS)[number])
            : "low",
    };
}

const RULES = `
You analyze teacher announcements and identify student work.

Your ONLY job is to determine what the student actually needs to do.

Do NOT compare against Canvas assignments.
Do NOT determine whether something is a duplicate.
Do NOT calculate dates.

CONFIDENCE:

HIGH:
The teacher explicitly assigns the work.

MEDIUM:
The work is strongly implied or preparation is clearly expected.

LOW:
The work is optional or only weakly suggested.

IMPORTANT RULES:

1. Only create a task when the student actually has something to do.

Do NOT create tasks for:

- events happening in class
- tests or quizzes merely being announced
- schedule changes
- room changes
- information
- reminders
- things the teacher says they will provide
- things that are simply happening
- casual encouragement

Example:

"There is no homework tonight."

→ tasks: []

Example:

"We will discuss Beowulf on Wednesday."

→ tasks: []

unless students are also told to read, prepare, complete something, etc.

2. Do NOT invent work.

Only extract work that is explicitly assigned or strongly implied.

Do not assume students should:

- study
- review
- read
- prepare
- practice

unless the announcement actually indicates this.

3. Keep task names concise and actionable.

Good:
"Read chapters 2-3"

Good:
"Complete response questions"

Bad:
"Homework for chapters 2-3"

4. If multiple distinct pieces of work are assigned, create separate tasks.

Example:

"Read chapters 2-3 and complete the response questions."

→ two tasks.

5. Preserve date wording exactly as it appears.

Examples:

"Wednesday" → "Wednesday"

"tomorrow" → "tomorrow"

"next Monday" → "next Monday"

"September 18" → "September 18"

"by Friday" → "Friday"

Do NOT convert dates to YYYY-MM-DD.

Do NOT calculate dates.

If there is no identifiable due date:

"dueText": null

6. Tables may appear in the announcement.

Tables may contain:

- assignments
- readings
- instructions
- due dates
- preparation requirements
- submission instructions

Use table information together.

Do NOT turn every table cell into a task.

Only create a task when the table indicates that the student
actually needs to perform an action.

7. Evidence must be an EXACT, verbatim quote copied from the announcement (at most 20 words) — never a paraphrase. Description is one short sentence.

8. Never output anything outside the requested structure.
`;

function buildAnnouncementBlock(
    announcement: Announcement,
    index: number,
    maxLength: number
): string {
    const stripped = extractActionableHtml(announcement.message, maxLength);

    if (stripped.length > maxLength) {
        console.warn(
            `✂️ Truncated announcement "${announcement.title}": ${stripped.length} → ${maxLength} chars — content beyond this point was not sent to the model.`
        );
    }

    const message = truncateText(stripped, maxLength);

    return `
ANNOUNCEMENT ${index + 1}
COURSE: ${announcement.course}
TITLE: ${announcement.title}
MESSAGE: ${message}
`;
}

function toProposedTasks(
    announcement: Announcement,
    tasks: AIExtractedTask[]
): ProposedTask[] {
    return tasks.map((task) => ({
        name: task.name,
        course: announcement.course,

        // Resolved client-side from dueText (lib/dueText.ts), using the
        // viewer's own browser timezone — no server-side date/timezone
        // guessing, consistent with this repo's due-date convention.
        due: null,

        dueText: task.dueText ?? null,
        description: task.description,
        evidence: task.evidence,

        sourceAnnouncementId: announcement.id,

        confidence: task.confidence,

        suggestionKey: computeSuggestionKey(announcement.id, task.name),

        // Placeholder — always overwritten by the duplicate-check pass in
        // app/api/ai/analyze-announcements/route.ts before this task ever
        // reaches a client.
        canvasMatch: {
            status: "none",
            checkConfidence: "low",
            assignmentId: null,
            reason: "",
            assignment: null,
        },

        sourceAnnouncement: {
            id: announcement.id,
            title: announcement.title,
            message: announcement.message,
            course: announcement.course,
            postedAt: announcement.postedAt,
        },

        matchedAssignment: undefined,
    }));
}

// Joins the model's per-announcement response entries back to the request
// by 1-based "index", the way both the Anthropic and Ollama paths report
// results. If the indexed lookup misses for a given announcement (a
// dropped/duplicated/off-by-one index — a real failure mode, not
// hypothetical), falls back to the entry at the same array position before
// giving up and degrading that one announcement to "no extractable tasks".
// A malformed/missing entry never fails the whole batch.
function toProposedTasksForAnnouncements(
    announcements: Announcement[],
    rawEntries: unknown[]
): AnnouncementAnalysisResult[] {
    const byIndex = new Map<number, Record<string, unknown>>();

    for (const entry of rawEntries) {
        if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { index?: unknown }).index === "number"
        ) {
            byIndex.set(
                (entry as { index: number }).index,
                entry as Record<string, unknown>
            );
        }
    }

    return announcements.map((announcement, i) => {
        const indexed = byIndex.get(i + 1);

        const positional =
            !indexed && rawEntries[i] && typeof rawEntries[i] === "object"
                ? (rawEntries[i] as Record<string, unknown>)
                : undefined;

        const entry = indexed ?? positional;

        if (!entry || !Array.isArray(entry.tasks)) {
            console.error(
                `⚠️ Response is missing or malformed for announcement ${i + 1}; treating it as having no extractable tasks.`,
                entry
            );

            return { tasks: [], ok: false };
        }

        const validatedTasks = entry.tasks
            .map(toValidatedTask)
            .filter((task): task is AIExtractedTask => task !== null);

        return { tasks: toProposedTasks(announcement, validatedTasks), ok: true };
    });
}

// --------------------------------------------------------------------
// Anthropic path (primary when ANTHROPIC_API_KEY is set) — Claude Haiku,
// forced tool use. Forced tool use with a strict schema means the SDK parses tool_use.input
// for us — no JSON.parse() step, and no free-text JSON to get wrong.
// --------------------------------------------------------------------

const EXTRACT_TOOL_NAME = "extract_announcement_tasks";

const EXTRACT_TOOL: Anthropic.Tool = {
    name: EXTRACT_TOOL_NAME,
    description:
        "Record the extracted student tasks for every announcement analyzed, one entry per announcement, in the same order given.",
    input_schema: {
        type: "object",
        properties: {
            announcements: {
                type: "array",
                description: "One entry per announcement analyzed above.",
                items: {
                    type: "object",
                    properties: {
                        index: {
                            type: "integer",
                            description: "1-based ANNOUNCEMENT number from the prompt.",
                        },
                        tasks: {
                            type: "array",
                            description: "Empty when there is nothing the student needs to do.",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "Short, actionable task name." },
                                    description: { type: "string", description: "One short sentence." },
                                    evidence: { type: "string", description: "Exact verbatim quote from the announcement, at most 20 words." },
                                    dueText: {
                                        anyOf: [{ type: "string" }, { type: "null" }],
                                        description: "Original date wording exactly as it appears, or null.",
                                    },
                                    confidence: {
                                        type: "string",
                                        enum: ["high", "medium", "low"],
                                    },
                                },
                                required: ["name", "description", "evidence", "dueText", "confidence"],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ["index", "tasks"],
                    additionalProperties: false,
                },
            },
        },
        required: ["announcements"],
        additionalProperties: false,
    },
    strict: true,
};

async function callAnthropicForBatch(
    announcements: Announcement[]
): Promise<unknown[]> {
    // RULES is already sent once via the `system` field below — pasting it
    // again here would double the fixed per-call token cost for no benefit.
    const prompt = `
Analyze EACH of the following ${announcements.length} announcements independently. Do not let one announcement's content influence another's tasks.

${announcements.map((a, i) => buildAnnouncementBlock(a, i, ANTHROPIC_MAX_MESSAGE_LENGTH)).join("\n")}

Call the ${EXTRACT_TOOL_NAME} tool exactly once with one entry per announcement above ("index" matching the ANNOUNCEMENT number, 1-based).
`;

    let response: Anthropic.Message;

    try {
        response = await getAnthropicClient().messages.create(
            {
                model: ANTHROPIC_MODEL,
                max_tokens: ANTHROPIC_MAX_TOKENS,
                system: RULES,
                tools: [EXTRACT_TOOL],
                tool_choice: { type: "tool", name: EXTRACT_TOOL_NAME },
                messages: [{ role: "user", content: prompt }],
            },
            { timeout: ANTHROPIC_TIMEOUT_MS }
        );
    } catch (error) {
        throw describeAnthropicError("announcement extraction", error);
    }

    logAnthropicUsage("announcement extraction", response);

    const input = getToolInput(response, EXTRACT_TOOL_NAME) as { announcements?: unknown };

    if (!Array.isArray(input.announcements)) {
        throw new Error("Anthropic tool call did not contain an announcements array.");
    }

    return input.announcements;
}

// A total batch-call failure (network/5xx/429 — not JSON validity, which
// the forced strict schema already guarantees structurally) is retried by
// splitting the batch in half and recursing — rather than dropping straight
// to N fully-individual calls — so a transient failure affecting only part
// of a batch doesn't throw away the RULES-sharing benefit of the whole
// batch. Bottoms out at a single announcement, which degrades to "no
// extractable tasks" on failure rather than throwing.
async function analyzeAnnouncementsWithAnthropic(
    announcements: Announcement[]
): Promise<AnnouncementAnalysisResult[]> {
    try {
        const rawEntries = await callAnthropicForBatch(announcements);
        return toProposedTasksForAnnouncements(announcements, rawEntries);
    } catch (error) {
        if (announcements.length === 1) {
            console.error(
                `❌ Anthropic call failed for announcement "${announcements[0].title}"; treating it as having no extractable tasks.`,
                error
            );

            return [{ tasks: [], ok: false }];
        }

        const mid = Math.ceil(announcements.length / 2);

        console.error(
            `❌ Anthropic batch call failed for ${announcements.length} announcements; retrying as two batches of ${mid} and ${
                announcements.length - mid
            }.`,
            error
        );

        const [firstHalf, secondHalf] = await Promise.all([
            analyzeAnnouncementsWithAnthropic(announcements.slice(0, mid)),
            analyzeAnnouncementsWithAnthropic(announcements.slice(mid)),
        ]);

        return [...firstHalf, ...secondHalf];
    }
}

// --------------------------------------------------------------------
// Ollama path — used when ANTHROPIC_API_KEY is unset, so turning off the
// Anthropic path is a one-line env change, not a code change.
// --------------------------------------------------------------------

async function analyzeAnnouncementsWithOllama(
    announcements: Announcement[]
): Promise<AnnouncementAnalysisResult[]> {
    const prompt = `
${RULES}

Analyze EACH of the following ${announcements.length} announcements independently. Do not let one announcement's content influence another's tasks.

${announcements.map((a, i) => buildAnnouncementBlock(a, i, OLLAMA_MAX_MESSAGE_LENGTH)).join("\n")}

RETURN ONLY VALID JSON, with exactly one entry per announcement above, in this exact shape:

{
  "announcements": [
    {
      "index": 1,
      "tasks": [
        {
          "name": "short actionable task name",
          "description": "one short sentence",
          "evidence": "exact verbatim quote from the announcement, at most 20 words",
          "dueText": "original date wording or null",
          "confidence": "high"
        }
      ]
    }
  ]
}

- "index" must match the ANNOUNCEMENT number above (1-based).
- "tasks" is an empty array when there is nothing the student needs to do.
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
                            "You are a strict JSON extraction system. Return only the requested JSON object.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                stream: false,
                format: "json",
                options: {
                    temperature: 0,
                    num_ctx: OLLAMA_NUM_CTX,
                    num_predict:
                        PREDICT_TOKENS_BASE +
                        PREDICT_TOKENS_PER_ANNOUNCEMENT * announcements.length,
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
    }

    if (!response.ok) {
        throw new Error(
            `Ollama request failed: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    const content = data.message?.content;

    if (!content) {
        throw new Error("Ollama returned no content.");
    }

    let parsed: { announcements?: unknown };

    try {
        parsed = JSON.parse(content);
    } catch {
        console.error("❌ Invalid Ollama JSON:", content);
        throw new Error("Ollama returned invalid JSON.");
    }

    if (!Array.isArray(parsed.announcements)) {
        throw new Error(
            "Ollama response did not contain an announcements array."
        );
    }

    return toProposedTasksForAnnouncements(announcements, parsed.announcements);
}

/**
 * Extracts proposed tasks from a batch of announcements. Primary path is
 * Claude Haiku (Anthropic API, forced tool use) when ANTHROPIC_API_KEY is
 * set; falls back to the local Ollama model otherwise. Batching cuts the
 * fixed per-call cost (the RULES block) proportionally across the batch. A
 * malformed/missing entry for one announcement degrades just that
 * announcement to "no extractable tasks" rather than failing the whole
 * batch (see toProposedTasksForAnnouncements) — the caller's outer catch
 * remains the fallback for genuine total failures.
 */
export async function analyzeAnnouncements(
    announcements: Announcement[]
): Promise<AnnouncementAnalysisResult[]> {
    if (announcements.length === 0) {
        return [];
    }

    return isAnthropicEnabled()
        ? analyzeAnnouncementsWithAnthropic(announcements)
        : analyzeAnnouncementsWithOllama(announcements);
}
