import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { analyzeAssignments, estimateMinutesByType, normalizeAssignmentType } from "@/lib/analyzeAssignment";
import { calculatePriority } from "@/lib/prioritization";
import { chunk, mapWithConcurrency } from "@/lib/concurrency";
import { getTaskSignature } from "@/lib/taskPlanning";
import { isAnthropicEnabled } from "@/lib/ai/anthropicClient";

type PlanningTask = {
    id: string;
    name: string;
    course: string;
    description?: string | null;
    due?: string | null;
    pointsPossible?: number | null;
};

async function getAuthenticatedUser() {
    const session = await auth();

    if (!session?.user?.email) {
        return null;
    }

    return prisma.user.findUnique({
        where: { email: session.user.email },
    });
}

export async function GET() {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { success: false, error: "You must be logged in." },
            { status: 401 }
        );
    }

    const estimates = await prisma.taskPlanningEstimate.findMany({
        where: { userId: user.id },
    });

    return NextResponse.json({
        success: true,
        estimates: estimates.map(toEstimateResponse),
    });
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

// Assignments analyzed per model call. Each call resends the full
// rubric/instructions regardless of batch size, so batching cuts that
// fixed per-call cost proportionally across the batch — Haiku's context
// fits far more per call than the local model's.
const ANTHROPIC_ANALYSIS_BATCH_SIZE = 20;
const OLLAMA_ANALYSIS_BATCH_SIZE = 5;

function toEstimateResponse(estimate: {
    taskId: string;
    signature: string;
    estimatedMinutes: number;
    importance: number;
    difficulty: number;
    consequence: number;
    reason: string;
    assignmentType: string | null;
    priorityScore: number;
    urgencyScore: number;
    frogScore: number;
    priorityReason: string;
}) {
    return {
        id: estimate.taskId,
        signature: estimate.signature,
        estimatedMinutes: estimate.estimatedMinutes,
        importance: estimate.importance,
        difficulty: estimate.difficulty,
        consequence: estimate.consequence,
        reason: estimate.reason,
        assignmentType: estimate.assignmentType,
        priorityScore: estimate.priorityScore,
        urgencyScore: estimate.urgencyScore,
        frogScore: estimate.frogScore,
        priorityReason: estimate.priorityReason,
    };
}

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { success: false, error: "You must be logged in." },
            { status: 401 }
        );
    }

    let tasks: PlanningTask[];

    try {
        const body =
            await request.json() as {
                tasks?: unknown;
            };

        tasks =
            Array.isArray(body.tasks)
                ? body.tasks
                    // Defensive upper bound on request size, not the real
                    // policy — the client already scopes/caps which tasks
                    // it sends (lib/taskPlanning.ts's
                    // selectTasksNeedingEstimates, capped at 60). This just
                    // needs to stay above that cap so a legitimate request
                    // never gets silently truncated back down.
                    .slice(0, 75)
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
            { success: false, error: "Invalid task data" },
            { status: 400 }
        );
    }

    if (tasks.length === 0) {
        return NextResponse.json({
            success: true,
            estimates: [],
        });
    }

    // Spend guard: this is a paid call now, so an estimate already stored
    // for the task's current signature is returned as-is instead of being
    // re-analyzed — a client bug or several open tabs re-requesting the
    // same tasks can't re-bill them.
    const storedEstimates = await prisma.taskPlanningEstimate.findMany({
        where: { userId: user.id, taskId: { in: tasks.map((task) => task.id) } },
    });

    const storedByTaskId = new Map(storedEstimates.map((estimate) => [estimate.taskId, estimate]));

    const reusedEstimates = tasks
        .map((task) => storedByTaskId.get(task.id))
        .filter(
            (estimate, i): estimate is NonNullable<typeof estimate> =>
                estimate !== undefined && estimate.signature === getTaskSignature(tasks[i])
        )
        .map(toEstimateResponse);

    const reusedIds = new Set(reusedEstimates.map((estimate) => estimate.id));

    tasks = tasks.filter((task) => !reusedIds.has(task.id));

    const batches = chunk(
        tasks,
        isAnthropicEnabled() ? ANTHROPIC_ANALYSIS_BATCH_SIZE : OLLAMA_ANALYSIS_BATCH_SIZE
    );

    const estimatesByBatch = await mapWithConcurrency(
        batches,
        OLLAMA_CONCURRENCY,
        async (batch) => {
            // analyzeAssignments never throws — it degrades to its own
            // deterministic fallback internally on any Ollama failure.
            const analyses = await analyzeAssignments(
                batch.map((task) => ({
                    name: task.name,
                    course: task.course,
                    description: task.description,
                    due: task.due,
                    pointsPossible: task.pointsPossible,
                }))
            );

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

                    signature: getTaskSignature(task),

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

    const estimates = estimatesByBatch.flat();

    // Compute-and-persist in one route — the client no longer needs a
    // separate round trip to save what it just received.
    await mapWithConcurrency(estimates, 10, (estimate) => upsertEstimate(user.id, estimate));

    return NextResponse.json({
        success: true,
        estimates: [...reusedEstimates, ...estimates],
    });
}

type StoredEstimate = {
    id: string;
    signature: string;
    estimatedMinutes: number;
    importance: number;
    difficulty: number;
    consequence: number;
    reason: string;
    assignmentType: string | null;
    priorityScore: number;
    urgencyScore: number;
    frogScore: number;
    priorityReason: string;
};

function upsertEstimate(userId: string, estimate: StoredEstimate) {
    const data = {
        signature: estimate.signature,
        estimatedMinutes: estimate.estimatedMinutes,
        importance: estimate.importance,
        difficulty: estimate.difficulty,
        consequence: estimate.consequence,
        reason: estimate.reason,
        assignmentType: estimate.assignmentType,
        priorityScore: estimate.priorityScore,
        urgencyScore: estimate.urgencyScore,
        frogScore: estimate.frogScore,
        priorityReason: estimate.priorityReason,
    };

    return prisma.taskPlanningEstimate.upsert({
        where: { userId_taskId: { userId, taskId: estimate.id } },
        update: data,
        create: { userId, taskId: estimate.id, ...data },
    });
}

function isValidStoredEstimate(value: unknown): value is StoredEstimate {
    if (typeof value !== "object" || value === null) return false;
    const e = value as Record<string, unknown>;

    return (
        typeof e.id === "string" &&
        typeof e.signature === "string" &&
        typeof e.estimatedMinutes === "number" &&
        typeof e.importance === "number" &&
        typeof e.difficulty === "number" &&
        typeof e.consequence === "number" &&
        typeof e.reason === "string" &&
        (e.assignmentType === null || e.assignmentType === undefined || typeof e.assignmentType === "string") &&
        typeof e.priorityScore === "number" &&
        typeof e.urgencyScore === "number" &&
        typeof e.frogScore === "number" &&
        typeof e.priorityReason === "string"
    );
}

// Stores already-computed estimates directly (no Ollama call) — used only
// by the one-time legacy-localStorage migration in WeeklyPlannerView.tsx,
// so a browser with a large existing cache of estimates doesn't trigger a
// bulk Ollama recompute burst just to move them server-side.
export async function PUT(request: Request) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { success: false, error: "You must be logged in." },
            { status: 401 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { success: false, error: "Invalid JSON body." },
            { status: 400 }
        );
    }

    const rawEstimates = (body as { estimates?: unknown } | null)?.estimates;

    if (!Array.isArray(rawEstimates)) {
        return NextResponse.json(
            { success: false, error: "'estimates' must be an array." },
            { status: 400 }
        );
    }

    // Degrade per-entry rather than all-or-nothing: a malformed/stale
    // entry (e.g. from an older, incompatible localStorage cache shape)
    // shouldn't block every other valid entry in the same batch.
    const validEstimates = rawEstimates.filter(isValidStoredEstimate).slice(0, 1000);

    await mapWithConcurrency(validEstimates, 10, (estimate) => upsertEstimate(user.id, estimate));

    return NextResponse.json({ success: true, storedCount: validEstimates.length });
}