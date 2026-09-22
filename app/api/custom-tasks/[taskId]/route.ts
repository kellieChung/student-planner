import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAiTaskEvent } from "@/lib/aiTaskEvents";

type Params = {
    params: Promise<{
        taskId: string;
    }>;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

async function getOwnedCustomTask(userId: string, taskId: string) {
    const task = await prisma.customTask.findUnique({ where: { id: taskId } });

    return task && task.userId === userId ? task : null;
}

export async function PATCH(request: Request, { params }: Params) {
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

        const { taskId } = await params;

        if (!taskId) {
            return NextResponse.json(
                { success: false, error: "'taskId' is required." },
                { status: 400 }
            );
        }

        const existing = await getOwnedCustomTask(user.id, taskId);

        if (!existing) {
            return NextResponse.json(
                { success: false, error: "Custom task not found." },
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

        const {
            name = existing.name,
            course = existing.course,
            due = existing.due,
            dueAt = existing.dueAt ? existing.dueAt.toISOString() : null,
            dueFraction = existing.dueFraction,
            // Set true when this single occurrence of a recurring series is
            // edited via the "this occurrence only" scope, so a later
            // "this and following" series edit skips it. Defaults to the
            // existing value (like every other field here) — an unrelated
            // save never resets it back to false on its own.
            recurrenceOverridden = existing.recurrenceOverridden,
            // Set when the user dismisses the "AI-detected" badge on this
            // card. Defaults to the existing value like every other field
            // here — an unrelated save (e.g. a due-date edit) never resets
            // it back to null.
            aiTagDismissedAt = existing.aiTagDismissedAt
                ? existing.aiTagDismissedAt.toISOString()
                : null,
        } = body as {
            name?: unknown;
            course?: unknown;
            due?: unknown;
            dueAt?: unknown;
            dueFraction?: unknown;
            recurrenceOverridden?: unknown;
            aiTagDismissedAt?: unknown;
        } | null ?? {};

        if (typeof name !== "string" || !name.trim()) {
            return NextResponse.json(
                { success: false, error: "'name' must be a non-empty string." },
                { status: 400 }
            );
        }

        if (typeof course !== "string" || !course.trim()) {
            return NextResponse.json(
                { success: false, error: "'course' must be a non-empty string." },
                { status: 400 }
            );
        }

        if (due !== null && (typeof due !== "string" || !DATE_ONLY.test(due))) {
            return NextResponse.json(
                { success: false, error: "'due' must be null or a 'YYYY-MM-DD' string." },
                { status: 400 }
            );
        }

        const dueAtDate = dueAt === null
            ? null
            : typeof dueAt === "string" && !Number.isNaN(new Date(dueAt).getTime())
                ? new Date(dueAt)
                : undefined;

        if (dueAtDate === undefined) {
            return NextResponse.json(
                { success: false, error: "'dueAt' must be null or a valid ISO datetime string." },
                { status: 400 }
            );
        }

        if (dueFraction !== null && typeof dueFraction !== "number") {
            return NextResponse.json(
                { success: false, error: "'dueFraction' must be null or a number." },
                { status: 400 }
            );
        }

        if (typeof recurrenceOverridden !== "boolean") {
            return NextResponse.json(
                { success: false, error: "'recurrenceOverridden' must be a boolean." },
                { status: 400 }
            );
        }

        const aiTagDismissedAtDate = aiTagDismissedAt === null
            ? null
            : typeof aiTagDismissedAt === "string" && !Number.isNaN(new Date(aiTagDismissedAt).getTime())
                ? new Date(aiTagDismissedAt)
                : undefined;

        if (aiTagDismissedAtDate === undefined) {
            return NextResponse.json(
                { success: false, error: "'aiTagDismissedAt' must be null or a valid ISO datetime string." },
                { status: 400 }
            );
        }

        const customTask = await prisma.customTask.update({
            where: { id: taskId },
            data: {
                name: name.trim(),
                course: course.trim(),
                due,
                dueAt: dueAtDate,
                dueFraction,
                recurrenceOverridden,
                aiTagDismissedAt: aiTagDismissedAtDate,
            },
        });

        // Only a genuine null -> timestamp transition counts as "the user
        // dismissed it just now" — re-sending an already-dismissed value
        // on an unrelated save (the default above) must not re-log it.
        if (!existing.aiTagDismissedAt && customTask.aiTagDismissedAt) {
            try {
                await logAiTaskEvent(user.id, "ai_tag_dismissed", { taskId: customTask.id });
            } catch (error) {
                console.error("❌ Failed to log AI tag dismissal:", error);
            }
        }

        return NextResponse.json({
            success: true,
            customTask: {
                id: customTask.id,
                name: customTask.name,
                course: customTask.course,
                due: customTask.due,
                dueAt: customTask.dueAt ? customTask.dueAt.toISOString() : null,
                dueFraction: customTask.dueFraction,
                sourceAnnouncementId: customTask.sourceAnnouncementId,
                createdAt: customTask.createdAt.toISOString(),
                recurrenceId: customTask.recurrenceId,
                recurrenceOverridden: customTask.recurrenceOverridden,
                aiTagDismissedAt: customTask.aiTagDismissedAt ? customTask.aiTagDismissedAt.toISOString() : null,
            },
        });
    } catch (error) {
        console.error("❌ Failed to update custom task:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

export async function DELETE(_request: Request, { params }: Params) {
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

        const { taskId } = await params;

        const existing = await getOwnedCustomTask(user.id, taskId);

        if (!existing) {
            return NextResponse.json(
                { success: false, error: "Custom task not found." },
                { status: 404 }
            );
        }

        await prisma.customTask.delete({ where: { id: taskId } });

        // Only meaningful for a task that came from an AI-detected
        // candidate — carries both signals AutoTaskCreation.md's logging
        // section wants for an auto-inserted task: deleted after
        // dismissing the tag (implicit "it was fine, just done with it")
        // vs. deleted without ever dismissing it (implicit "it was wrong").
        if (existing.sourceAnnouncementId) {
            try {
                await logAiTaskEvent(user.id, "ai_task_deleted", {
                    taskId: existing.id,
                    sourceAnnouncementId: existing.sourceAnnouncementId,
                    data: { wasTagDismissed: existing.aiTagDismissedAt !== null },
                });
            } catch (error) {
                console.error("❌ Failed to log AI task deletion:", error);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ Failed to delete custom task:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
