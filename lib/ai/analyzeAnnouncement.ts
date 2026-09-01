import { Announcement } from "@/types/announcement";
import { ProposedTask } from "@/types/proposedTask";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:3b-instruct";

type AIExtractedTask = {
    name: string;
    description: string;
    evidence: string;
    dueText: string | null;
    confidence: "high" | "medium" | "low";
};

export async function analyzeAnnouncement(
    announcement: Announcement
): Promise<ProposedTask[]> {
    const prompt = `
You analyze a teacher announcement and identify student work.

Your ONLY job is to determine what the student actually needs to do.

Do NOT compare against Canvas assignments.
Do NOT determine whether something is a duplicate.
Do NOT calculate dates.

Return ONLY valid JSON.

Use exactly this format:

{
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

ANNOUNCEMENT COURSE:
${announcement.course}

ANNOUNCEMENT TITLE:
${announcement.title}

ANNOUNCEMENT MESSAGE:
${announcement.message}
`;

    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            stream: false,
                    }),
    });

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

    let parsed: {
        tasks: AIExtractedTask[];
    };

    try {
        parsed = JSON.parse(content);
    } catch {
        console.error("❌ Invalid Ollama JSON:", content);
        throw new Error("Ollama returned invalid JSON.");
    }

    if (!Array.isArray(parsed.tasks)) {
        throw new Error(
            "Ollama response did not contain a tasks array."
        );
    }

    return parsed.tasks.map((task) => ({
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