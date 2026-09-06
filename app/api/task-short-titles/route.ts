import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { classifyLabelType, deterministicShortTitle } from "@/lib/taskLabel";
import { generateShortTitles } from "@/lib/generateShortTitle";
import { chunk, mapWithConcurrency } from "@/lib/concurrency";
import { CUSTOM_COURSE_ORIGIN } from "@/lib/canvas";

// Local LLM inference is CPU/GPU-heavy per call; running many at once just
// makes several full inference passes fight over the same compute
// resources instead of finishing faster.
const OLLAMA_CONCURRENCY = 2;

// Items shortened per Ollama call — smaller per-item payload than
// task-planning's analysis, so a larger batch is fine.
const SHORT_TITLE_BATCH_SIZE = 8;

export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
            );
        }

        let taskIds: string[];
        let force: boolean;

        try {
            const body = await request.json() as { taskIds?: unknown; force?: unknown };

            taskIds = Array.isArray(body.taskIds)
                // Defensive upper bound, not the real policy — the client
                // already scopes/caps which tasks it sends
                // (lib/taskLabel.ts's selectTasksNeedingShortTitles,
                // capped at 60). This just needs to stay above that cap.
                ? body.taskIds.slice(0, 75).filter((id): id is string => typeof id === "string")
                : [];
            // Set by the "Regenerate" button in EditTaskModal — an
            // explicit user action, so it's allowed to bypass both the
            // "never recompute once set" rule and the deterministic
            // short-circuit below (skipping Ollama entirely otherwise
            // wouldn't accomplish what the user asked for).
            force = body.force === true;
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid request body." },
                { status: 400 }
            );
        }

        if (taskIds.length === 0) {
            return NextResponse.json({ success: true, shortTitles: [] });
        }

        // Re-checking shortTitle: null server-side (not just trusting the
        // client's filter) is what actually enforces "never recompute
        // once set" for the automatic background pass — the client-side
        // filter there is only an optimization to avoid wasted requests.
        // `force` (the manual "Regenerate" action) deliberately skips
        // this filter.
        const assignments = await prisma.assignment.findMany({
            where: {
                id: { in: taskIds },
                userId: user.id,
                ...(force ? {} : { shortTitle: null }),
            },
            include: { course: true },
        });

        if (assignments.length === 0) {
            return NextResponse.json({ success: true, shortTitles: [] });
        }

        const candidates = assignments.map((assignment) => {
            const course = assignment.course.displayName ?? assignment.course.name;
            const typeCode = classifyLabelType({
                name: assignment.name,
                course,
                description: assignment.description,
                isCustomCourse: assignment.course.canvasOrigin === CUSTOM_COURSE_ORIGIN,
            });

            return {
                id: assignment.id,
                name: assignment.name,
                course,
                typeCode,
                deterministicShortTitle: deterministicShortTitle({
                    name: assignment.name,
                    course,
                    typeCode,
                }),
            };
        });

        // Every eligible task gets an Ollama pass — regex heuristics can't
        // judge "important vs. unimportant" the way a model can, so the
        // deterministic result is only a reference/fallback now, not a
        // gate that skips Ollama whenever it happens to already be short.
        const resolved: Record<string, string> = {};

        const batches = chunk(candidates, SHORT_TITLE_BATCH_SIZE);

        const batchResults = await mapWithConcurrency(
            batches,
            OLLAMA_CONCURRENCY,
            generateShortTitles
        );

        for (const batchResult of batchResults) {
            Object.assign(resolved, batchResult);
        }

        await prisma.$transaction(
            Object.entries(resolved).map(([id, shortTitle]) =>
                prisma.assignment.update({
                    where: { id },
                    data: { shortTitle },
                })
            )
        );

        return NextResponse.json({
            success: true,
            shortTitles: Object.entries(resolved).map(([id, shortTitle]) => ({ id, shortTitle })),
        });
    } catch (error) {
        console.error("❌ Failed to generate short titles:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

// Manual edit of a single task's short title, from EditTaskModal's "Short
// title" field. An empty string clears the override, reverting the card
// to its live deterministic short title.
export async function PATCH(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
            );
        }

        let taskId: unknown;
        let shortTitle: unknown;

        try {
            const body = await request.json() as { taskId?: unknown; shortTitle?: unknown };
            taskId = body.taskId;
            shortTitle = body.shortTitle;
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid request body." },
                { status: 400 }
            );
        }

        if (typeof taskId !== "string" || typeof shortTitle !== "string") {
            return NextResponse.json(
                { success: false, error: "'taskId' and 'shortTitle' are required." },
                { status: 400 }
            );
        }

        const existing = await prisma.assignment.findFirst({
            where: { id: taskId, userId: user.id },
        });

        if (!existing) {
            return NextResponse.json(
                { success: false, error: "Task not found." },
                { status: 404 }
            );
        }

        const trimmed = shortTitle.trim();

        const updated = await prisma.assignment.update({
            where: { id: taskId },
            data: { shortTitle: trimmed ? trimmed : null },
        });

        return NextResponse.json({ success: true, shortTitle: updated.shortTitle });
    } catch (error) {
        console.error("❌ Failed to save short title:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
