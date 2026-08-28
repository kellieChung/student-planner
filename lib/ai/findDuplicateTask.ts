const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen3:4b";

export type DuplicateCheckResult = {
    isDuplicate: boolean;
    matchingAssignmentId: string | null;
    confidence: "high" | "medium" | "low";
    reason: string;
};

type ExistingAssignment = {
    id: string;
    name: string;
    description: string | null;
    dueDate: string | null;
};

export async function findDuplicateTask(
    proposedTaskName: string,
    assignments: ExistingAssignment[]
): Promise<DuplicateCheckResult> {
    if (assignments.length === 0) {
        return {
            isDuplicate: false,
            matchingAssignmentId: null,
            confidence: "high",
            reason: "No existing Canvas assignments were available to compare.",
        };
    }

    // Keep prompts small so local models don't waste time processing
    // enormous Canvas descriptions.
    const assignmentContext = assignments
        .map(
            (assignment, index) => `
ASSIGNMENT ${index + 1}
ID: ${assignment.id}
NAME: ${assignment.name}
DUE: ${assignment.dueDate ?? "none"}
DESCRIPTION:
${(assignment.description ?? "No description available").slice(0, 1500)}
`
        )
        .join("\n");

    const prompt = `
You are checking whether a proposed student task is already covered by an existing Canvas assignment.

Your job is ONLY to identify the best matching Canvas assignment, if one exists.

A task is a DUPLICATE when completing the Canvas assignment would reasonably mean the student has already completed the proposed task.

Because this result will be shown to the student as a SUGGESTION, prefer detecting a possible duplicate rather than missing one.

However, do NOT call tasks duplicates merely because they:
- are about the same topic
- involve the same book, chapter, unit, or class
- happen around the same time
- have similar wording
- are related activities
- are both reading, writing, discussion, studying, or watching

The actual student work must overlap.

IMPORTANT:
A Canvas assignment can contain multiple pieces of work.
If the proposed task is clearly one of those pieces, it IS a duplicate.

Examples:

Proposed: "Read Beowulf lines 1-709"
Canvas: "Read Beowulf lines 1-709 and answer questions"
=> DUPLICATE

Proposed: "Write Beowulf response"
Canvas: "Read Beowulf lines 1-709"
=> NOT DUPLICATE

Proposed: "Complete Significant Figures Practice"
Canvas: "COMPLETE: Significant Figures Practice"
=> DUPLICATE

Proposed: "Read Chapter 1"
Canvas: "Write a response about Chapter 1"
=> NOT DUPLICATE

Proposed: "Read Chapter 1"
Canvas: "Read Chapter 1 and complete notes"
=> DUPLICATE

Proposed: "Post discussion response"
Canvas: "DISCUSS: Chapter 1 Initial Post"
=> DUPLICATE

Proposed: "Post discussion response"
Canvas: "Read Chapter 1"
=> NOT DUPLICATE

DECISION RULE:

Ask:
"If the student completes this Canvas assignment, would I reasonably consider the proposed task completed too?"

YES -> isDuplicate true
NO -> isDuplicate false

When there is a plausible but imperfect match, it is acceptable to return true with MEDIUM confidence because this is only a suggestion.

Do not invent requirements that are not present in the Canvas assignment.

Choose the SINGLE best matching assignment.

CONFIDENCE:
HIGH = clearly the same work or the proposed task is explicitly included.
MEDIUM = likely the same work but wording/details are somewhat ambiguous.
LOW = weak or uncertain relationship.

If no assignment is a reasonable match:
- isDuplicate must be false
- matchingAssignmentId must be null

If isDuplicate is true:
- matchingAssignmentId must be the ID of the best matching Canvas assignment.

Return ONLY this JSON object:

{
  "isDuplicate": true,
  "matchingAssignmentId": "assignment-id",
  "confidence": "high"
}

Do not include a reason.
Do not include markdown.
Do not explain your answer.
Do not summarize the assignments.

PROPOSED TASK:
${proposedTaskName}

EXISTING CANVAS ASSIGNMENTS:
${assignmentContext}
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
            format: "json",
            think: false,
            options: {
                temperature: 0.1,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(
            `Ollama request failed: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    const content = data?.message?.content;

    if (!content || typeof content !== "string") {
        throw new Error(
            "Ollama returned no duplicate-check content."
        );
    }

    let parsed: any;

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
        typeof parsed.isDuplicate !== "boolean" ||
        !["high", "medium", "low"].includes(parsed.confidence)
    ) {
        console.error(
            "❌ Invalid duplicate-check structure:",
            parsed
        );

        throw new Error(
            "Ollama returned an invalid duplicate-check structure."
        );
    }

    if (parsed.isDuplicate) {
        const matchingAssignment = assignments.find(
            (assignment) =>
                assignment.id === parsed.matchingAssignmentId
        );

        if (!matchingAssignment) {
            console.error(
                "❌ Model selected invalid assignment ID:",
                parsed
            );

            return {
                isDuplicate: false,
                matchingAssignmentId: null,
                confidence: "low",
                reason:
                    "The model identified a duplicate but did not return a valid Canvas assignment.",
            };
        }
    }

    return {
        isDuplicate: parsed.isDuplicate,
        matchingAssignmentId: parsed.isDuplicate
            ? parsed.matchingAssignmentId
            : null,
        confidence: parsed.confidence,
        reason: parsed.isDuplicate
            ? "This task may already be covered by an existing Canvas assignment."
            : "No existing Canvas assignment appears to cover this task.",
    };
}