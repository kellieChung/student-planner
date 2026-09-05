import { NextResponse } from "next/server";
import { analyzeAssignments, estimateMinutesByType, normalizeAssignmentType } from "@/lib/analyzeAssignment";
import { calculatePriority } from "@/lib/prioritization";
import { chunk, mapWithConcurrency } from "@/lib/concurrency";

type PlanningTask = {
    id: string;
    name: string;
    course: string;
    description?: string | null;
    due?: string | null;
    pointsPossible?: number | null;
};

function fallbackAnalysis(task: PlanningTask) {
    const text =
        `${task.name} ${task.course} ${task.description ?? ""}`
            .toLowerCase();

    let importance = 4;
    let difficulty = 3;
    let consequence = 3;
    let assignmentType = "other";

    if (
        /(exam|midterm|final|research paper|presentation|project|capstone)/
            .test(text)
    ) {
        importance = 8;
        difficulty = 8;
        consequence = 7;
        assignmentType = "exam";
    } else if (
        /(essay|lab|problem set|homework)/
            .test(text)
    ) {
        importance = 6;
        difficulty = 6;
        consequence = 5;
        assignmentType = "homework";
    } else if (
        /(quiz|reading|discussion|worksheet)/
            .test(text)
    ) {
        importance = 4;
        difficulty = 3;
        consequence = 3;
        assignmentType = "reading";
    }

    return {
        importance,
        difficulty,
        consequence,
        assignmentType,
        reason:
            "This estimate was generated using a fallback because AI analysis was unavailable.",
    };
}

function normalizeAnalysis(analysis: {
    importance: unknown;
    difficulty: unknown;
    consequence: unknown;
    assignmentType: unknown;
    reason: unknown;
}) {
    const normalizeScore = (value: unknown, fallback: number) => {
        const score =
            typeof value === "number"
                ? value
                : Number(value);

        if (!Number.isFinite(score)) {
            return fallback;
        }

        return Math.min(
            10,
            Math.max(1, Math.round(score))
        );
    };

    return {
        importance: normalizeScore(
            analysis.importance,
            5
        ),

        difficulty: normalizeScore(
            analysis.difficulty,
            5
        ),

        consequence: normalizeScore(
            analysis.consequence,
            5
        ),

        assignmentType: normalizeAssignmentType(analysis.assignmentType),

        reason:
            typeof analysis.reason === "string"
                ? analysis.reason.trim()
                : "No explanation was provided.",
    };
}

// Local LLM inference is CPU/GPU-heavy per call; running many at once just
// makes several full inference passes fight over the same compute
// resources instead of finishing faster, so cap how many run concurrently.
const OLLAMA_CONCURRENCY = 2;

// Assignments analyzed per Ollama call. Each call resends the full
// rubric/instructions regardless of batch size, so batching cuts that
// fixed per-call cost proportionally across the batch.
const ANALYSIS_BATCH_SIZE = 5;

export async function POST(request: Request) {
    let tasks: PlanningTask[];

    try {
        const body =
            await request.json() as {
                tasks?: unknown;
            };

        tasks =
            Array.isArray(body.tasks)
                ? body.tasks
                    .slice(0, 40)
                    .filter(
                        (task): task is PlanningTask =>
                            typeof task === "object" &&
                            task !== null &&
                            typeof (task as PlanningTask).id === "string" &&
                            typeof (task as PlanningTask).name === "string"
                    )
                : [];
    } catch {
        return NextResponse.json(
            { error: "Invalid task data" },
            { status: 400 }
        );
    }

    if (tasks.length === 0) {
        return NextResponse.json({
            estimates: [],
        });
    }

    const batches = chunk(tasks, ANALYSIS_BATCH_SIZE);

    const estimatesByBatch = await mapWithConcurrency(
        batches,
        OLLAMA_CONCURRENCY,
        async (batch) => {
            let analyses;

            try {
                analyses = await analyzeAssignments(
                    batch.map((task) => ({
                        name: task.name,
                        course: task.course,
                        description: task.description,
                        due: task.due,
                        pointsPossible: task.pointsPossible,
                    }))
                );
            } catch {
                // One malformed/missing entry fails the whole batch; fall
                // back to the deterministic heuristic for every task in it
                // rather than trying to partially recover.
                analyses = batch.map((task) => fallbackAnalysis(task));
            }

            return batch.map((task, i) => {
                const normalized =
                    normalizeAnalysis(analyses[i]);

                const estimatedMinutes =
                    estimateMinutesByType(normalized.assignmentType);

                const priority =
                    calculatePriority({
                        name: task.name,
                        due: task.due ?? null,
                        importance: normalized.importance,
                        difficulty: normalized.difficulty,
                        consequence: normalized.consequence,
                        estimatedMinutes,
                    });

                return {
                    id: task.id,

                    estimatedMinutes,

                    importance:
                        normalized.importance,

                    difficulty:
                        normalized.difficulty,

                    consequence:
                        normalized.consequence,

                    assignmentType:
                        normalized.assignmentType,

                    reason:
                        normalized.reason,

                    priorityScore:
                        priority.score,

                    urgencyScore:
                        priority.urgencyScore,

                    frogScore:
                        priority.frogScore,

                    priorityReason:
                        priority.reason,
                };
            });
        }
    );

    return NextResponse.json({
        estimates: estimatesByBatch.flat(),
    });
}