import { NextResponse } from "next/server";
import { auth, sessionUserRef } from "@/auth";
import { prisma } from "@/lib/prisma";
import { backfillCanvasCompletions } from "@/lib/canvasCompletions";
import { isTaskLabelPart, normalizeTaskLabelParts, type TaskLabelPart } from "@/lib/taskLabel";
import { countQueries } from "@/lib/queryCount";

const SELECT = {
    autoAcceptAiTasks: true,
    completionSound: true,
    completeFromCanvas: true,
    taskLabelParts: true,
    workloadWarnings: true,
    lastRundownViewedAt: true,
} as const;

export const GET = countQueries("GET /api/planner-settings", async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = sessionUserRef(session);

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
            );
        }

        const settings = await prisma.plannerSettings.findUnique({
            where: { userId: user.id },
            select: SELECT,
        });

        return NextResponse.json({
            success: true,
            autoAcceptAiTasks: settings?.autoAcceptAiTasks ?? false,
            completionSound: settings?.completionSound ?? true,
            completeFromCanvas: settings?.completeFromCanvas ?? true,
            taskLabelParts: normalizeTaskLabelParts(settings?.taskLabelParts),
            workloadWarnings: settings?.workloadWarnings ?? true,
            lastRundownViewedAt: settings?.lastRundownViewedAt?.toISOString() ?? null,
        });
    } catch (error) {
        console.error("❌ Failed to load planner settings:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
});

export async function PATCH(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = sessionUserRef(session);

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
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

        const input = body as Record<string, unknown>;

        // Present-key-only partial update
        // — an absent key means "leave this field alone," so the Taskbar
        // toggle and the Rundown's dismiss action can never clobber each
        // other's field with a stale value.
        const data: {
            autoAcceptAiTasks?: boolean;
            completionSound?: boolean;
            completeFromCanvas?: boolean;
            taskLabelParts?: TaskLabelPart[];
            workloadWarnings?: boolean;
            lastRundownViewedAt?: Date | null;
        } = {};

        if ("autoAcceptAiTasks" in input) {
            if (typeof input.autoAcceptAiTasks !== "boolean") {
                return NextResponse.json(
                    { success: false, error: "'autoAcceptAiTasks' must be a boolean." },
                    { status: 400 }
                );
            }
            data.autoAcceptAiTasks = input.autoAcceptAiTasks;
        }

        if ("completionSound" in input) {
            if (typeof input.completionSound !== "boolean") {
                return NextResponse.json(
                    { success: false, error: "'completionSound' must be a boolean." },
                    { status: 400 }
                );
            }
            data.completionSound = input.completionSound;
        }

        if ("completeFromCanvas" in input) {
            if (typeof input.completeFromCanvas !== "boolean") {
                return NextResponse.json(
                    { success: false, error: "'completeFromCanvas' must be a boolean." },
                    { status: 400 }
                );
            }
            data.completeFromCanvas = input.completeFromCanvas;
        }

        if ("workloadWarnings" in input) {
            if (typeof input.workloadWarnings !== "boolean") {
                return NextResponse.json(
                    { success: false, error: "'workloadWarnings' must be a boolean." },
                    { status: 400 }
                );
            }
            data.workloadWarnings = input.workloadWarnings;
        }

        if ("taskLabelParts" in input) {
            const parts = input.taskLabelParts;
            const valid = Array.isArray(parts)
                && parts.every(isTaskLabelPart)
                && new Set(parts).size === parts.length
                && parts.includes("name");

            if (!valid) {
                return NextResponse.json(
                    { success: false, error: "'taskLabelParts' must list unique label parts, including 'name'." },
                    { status: 400 }
                );
            }
            data.taskLabelParts = parts;
        }

        if ("lastRundownViewedAt" in input) {
            if (typeof input.lastRundownViewedAt === "string") {
                data.lastRundownViewedAt = new Date(input.lastRundownViewedAt);
            } else if (input.lastRundownViewedAt === null) {
                data.lastRundownViewedAt = null;
            } else {
                return NextResponse.json(
                    { success: false, error: "'lastRundownViewedAt' must be a string or null." },
                    { status: 400 }
                );
            }
        }

        const previous = data.completeFromCanvas
            ? await prisma.plannerSettings.findUnique({
                where: { userId: user.id },
                select: { completeFromCanvas: true },
            })
            : null;

        const settings = await prisma.plannerSettings.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...data },
            update: data,
            select: SELECT,
        });

        // Turning it back on catches up on what Canvas reported submitted
        // while it was off (lib/canvasCompletions.ts).
        let completedCount = 0;

        if (previous?.completeFromCanvas === false && settings.completeFromCanvas) {
            completedCount = (await backfillCanvasCompletions(user.id)).completedTaskIds.length;
        }

        return NextResponse.json({
            success: true,
            autoAcceptAiTasks: settings.autoAcceptAiTasks,
            completionSound: settings.completionSound,
            completeFromCanvas: settings.completeFromCanvas,
            taskLabelParts: normalizeTaskLabelParts(settings.taskLabelParts),
            workloadWarnings: settings.workloadWarnings,
            completedCount,
            lastRundownViewedAt: settings.lastRundownViewedAt?.toISOString() ?? null,
        });
    } catch (error) {
        console.error("❌ Failed to save planner settings:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
