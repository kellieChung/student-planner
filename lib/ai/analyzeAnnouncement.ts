import { Announcement } from "@/types/announcement";
import { ProposedTask } from "@/types/proposedTask";
import { resolveDueDate } from "@/lib/ai/dateUtils";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:3b-instruct";


type AIExtractedTask = {
    name: string;
    dueReference: string | null;
    confidence: "high" | "medium" | "low";
};

export async function analyzeAnnouncement(
    announcement: Announcement
): Promise<ProposedTask[]> {
    const prompt = `
You extract student tasks from teacher announcements.

Your job is to identify every piece of work that the student is actually
expected to do based on this announcement.

Return ONLY JSON. No markdown. No explanation.

The JSON must have exactly this structure:

{
  "tasks": [
    {
      "name": "task name",
      "dueReference": "date phrase or null",
      "confidence": "high"
    }
  ]
}

For EVERY task, you MUST include all three fields:
- name
- dueReference
- confidence

confidence MUST be exactly one of:
- "high" — the teacher explicitly assigns the work or clearly tells students to do it
- "medium" — the work is strongly implied and students would reasonably be expected to do it
- "low" — the work is optional, uncertain, or only weakly implied

Never omit confidence.

IMPORTANT TASK RULES:

1. ONLY create a task when the student actually has something to do.

Do NOT create tasks for:
- events happening in class
- quizzes or tests merely being announced
- room changes
- schedule changes
- information or reminders
- things the teacher says they will provide
- things the teacher says are happening
- casual statements or encouragement

For example:

"There is no homework tonight. Enjoy your evening!"
→ tasks should be []

"We will be moving to room 204 on Wednesday."
→ tasks should be []

"I'll provide the readings in class."
→ tasks should be []

2. Do NOT invent work.

Only extract work that is explicitly assigned or strongly implied
by the announcement.

Do NOT assume that students need to:
- study for a test
- prepare for a presentation
- read something
- review notes
unless the announcement actually indicates that they should.

3. Optional work should generally have LOW confidence.

For example:

"If you're having trouble, try the extra problems."
→ create the task with confidence "low"

"Review the slides if you'd like."
→ create the task with confidence "low"

4. Work that is explicitly assigned should have HIGH confidence.

For example:

"Complete problems 1-10 by Friday."
→ confidence "high"

"Please read chapters 2-3 before Wednesday."
→ confidence "high"

5. Strongly implied preparation can have MEDIUM confidence.

For example:

"We will discuss chapters 3-5 on Wednesday. Come prepared to discuss them."
→ create a task for preparing/reading the chapters
→ confidence "medium"

6. Only extract work belonging to THIS course.

Ignore references to assignments belonging to other courses,
teachers, or students.

For example:

"Read chapters 10-12 by Friday. The history reading is also due Friday,
but that's for Mr. Chen's class."

→ Only extract the English assignment.
→ Do NOT create a task for the history reading.

7. Make task names actionable and concise.

Prefer:
"Read chapters 2-3"

instead of:
"Be familiar with chapters 2-3"

Prefer:
"Complete problems 1-10"

instead of:
"Homework"

Prefer:
"Read lab procedure"

instead of:
"Understand the procedure"

8. If multiple distinct pieces of work are assigned, create separate tasks.

For example:

"Read pages 20-25 and complete questions 1-5 by Friday."

should produce TWO tasks:

- "Read pages 20-25"
- "Complete questions 1-5"

Both should have the same dueReference.

9. Do not create a task simply because something is mentioned.

The announcement must indicate that the student needs to perform the action.

10. If there are no actual student tasks, return:

{
  "tasks": []
}

DATE RULES:

- "dueReference" must contain the exact date wording from the announcement.
- Do NOT calculate a date.
- Do NOT convert dates to YYYY-MM-DD.
- Preserve weekday and date wording when possible.

Examples:

"Wednesday" → "Wednesday"
"Wed" → "Wed"
"tomorrow" → "tomorrow"
"next Monday" → "next Monday"
"9/18" → "9/18"
"September 18" → "September 18"
"Wednesday, September 2" → "Wednesday, September 2"

If a task has no identifiable due date, use:

"dueReference": null

11. Each task must have the date that applies specifically to THAT task.

Do not leave dueReference null when a due date for that task is explicitly
given anywhere in the announcement.

For example:

"Read the lab instructions before Wednesday. The lab itself is Thursday,
and your lab report is due Monday, August 17."

must produce:

{
  "tasks": [
    {
      "name": "Read the lab instructions",
      "dueReference": "Wednesday",
      "confidence": "high"
    },
    {
      "name": "Complete the lab",
      "dueReference": "Thursday",
      "confidence": "medium"
    },
    {
      "name": "Submit the lab report",
      "dueReference": "Monday, August 17",
      "confidence": "high"
    }
  ]
}

Never assign one task's date to another task.
Never discard an explicit date that clearly applies to a task.

Here is the announcement:

COURSE:
${announcement.course}

TITLE:
${announcement.title}

MESSAGE:
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

    console.log(response)

    if (!response.ok) {
        throw new Error(
            `Ollama request failed: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    console.log("Raw Ollama response:", data);

    const content = data.message.content;

    const parsed: {
        tasks: AIExtractedTask[];
    } = JSON.parse(content);

    console.log("Parsed AI response:", parsed);

    console.log(
        "AI date references:",
        parsed.tasks.map((task) => ({
            name: task.name,
            dueReference: task.dueReference,
        }))
    );

    const proposedTasks: ProposedTask[] = parsed.tasks.map(
        (task: AIExtractedTask) => ({
            name: task.name,
            course: announcement.course,
            due: resolveDueDate(
                task.dueReference,
                new Date(announcement.postedAt)
            ),
            sourceAnnouncementId: announcement.id,
            confidence: task.confidence,
        })
    );

    return proposedTasks;
}