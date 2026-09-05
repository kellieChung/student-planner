import { Announcement } from "@/types/announcement";
import { ProposedTask } from "@/types/proposedTask";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:3b-instruct";
const OLLAMA_TIMEOUT_MS = 25_000;

const PREDICT_TOKENS_PER_ANNOUNCEMENT = 250;
const PREDICT_TOKENS_BASE = 100;

type AIExtractedTask = {
    name: string;
    description: string;
    evidence: string;
    dueText: string | null;
    confidence: "high" | "medium" | "low";
};

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

7. Keep evidence short.

8. Never output anything outside the JSON object.
`;

function buildAnnouncementBlock(
    announcement: Announcement,
    index: number
): string {
    return `
ANNOUNCEMENT ${index + 1}
COURSE: ${announcement.course}
TITLE: ${announcement.title}
MESSAGE: ${announcement.message}
`;
}

function toProposedTasks(
    announcement: Announcement,
    tasks: AIExtractedTask[]
): ProposedTask[] {
    return tasks.map((task) => ({
        name: task.name,
        course: announcement.course,

        // Date resolution happens later.
        due: null,

        dueText: task.dueText ?? null,
        description: task.description,
        evidence: task.evidence,

        sourceAnnouncementId: announcement.id,

        confidence: task.confidence,

        canvasMatch: {
            status: "none",
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

/**
 * Extracts proposed tasks from a batch of announcements in a single Ollama
 * call rather than one call per announcement — each call resends the full
 * instructional rules, so batching cuts that fixed per-call cost
 * proportionally. A malformed/missing entry for any one announcement fails
 * the whole batch (caller falls back per-announcement); this is a
 * deliberate simplicity/robustness tradeoff for a reasonably small batch
 * size, not a partial-recovery attempt.
 */
export async function analyzeAnnouncements(
    announcements: Announcement[]
): Promise<ProposedTask[][]> {
    if (announcements.length === 0) {
        return [];
    }

    const prompt = `
${RULES}

Analyze EACH of the following ${announcements.length} announcements independently. Do not let one announcement's content influence another's tasks.

${announcements.map(buildAnnouncementBlock).join("\n")}

RETURN ONLY VALID JSON, with exactly one entry per announcement above, in this exact shape:

{
  "announcements": [
    {
      "index": 1,
      "tasks": [
        {
          "name": "short actionable task name",
          "description": "what the student needs to do",
          "evidence": "short quote or paraphrase from the announcement",
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
    } finally {
        clearTimeout(timeout);
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

    const byIndex = new Map<number, Record<string, unknown>>();

    for (const entry of parsed.announcements) {
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
        const entry = byIndex.get(i + 1);

        if (!entry || !Array.isArray(entry.tasks)) {
            throw new Error(
                `Ollama batch response is missing or malformed for announcement ${i + 1}.`
            );
        }

        return toProposedTasks(
            announcement,
            entry.tasks as AIExtractedTask[]
        );
    });
}
