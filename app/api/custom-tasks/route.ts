import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
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

        const customTasks = await prisma.customTask.findMany({
            where: { userId: user.id },
        });

        return NextResponse.json({
            success: true,
            customTasks: customTasks.map((task) => ({
                id: task.id,
                name: task.name,
                course: task.course,
                due: task.due,
                dueAt: task.dueAt ? task.dueAt.toISOString() : null,
                dueFraction: task.dueFraction,
                sourceAnnouncementId: task.sourceAnnouncementId,
                createdAt: task.createdAt.toISOString(),
            })),
        });
    } catch (error) {
        console.error("❌ Failed to load custom tasks:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

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
            id,
            name,
            course,
            due = null,
            dueAt = null,
            dueFraction = null,
            sourceAnnouncementId = null,
        } = body as {
            id?: unknown;
            name?: unknown;
            course?: unknown;
            due?: unknown;
            dueAt?: unknown;
            dueFraction?: unknown;
            sourceAnnouncementId?: unknown;
        } | null ?? {};

        // Client-supplied, not server-generated — dozens of call sites key
        // off id.startsWith("custom-"). Only accept that exact shape, both
        // to keep the convention meaningful and to keep ids unguessable
        // across users (see the ownership check below).
        if (typeof id !== "string" || !id.startsWith("custom-")) {
            return NextResponse.json(
                { success: false, error: "'id' must be a string starting with 'custom-'." },
                { status: 400 }
            );
        }

        if (typeof name !== "string" || !name.trim()) {
            return NextResponse.json(
                { success: false, error: "'name' is required." },
                { status: 400 }
            );
        }

        if (typeof course !== "string" || !course.trim()) {
            return NextResponse.json(
                { success: false, error: "'course' is required." },
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

        if (sourceAnnouncementId !== null && typeof sourceAnnouncementId !== "string") {
            return NextResponse.json(
                { success: false, error: "'sourceAnnouncementId' must be null or a string." },
                { status: 400 }
            );
        }

        // id is globally unique (not scoped by userId) since it's
        // client-supplied — check ownership explicitly rather than a blind
        // upsert, so one user can never overwrite another user's row by
        // guessing/reusing a "custom-<timestamp>" id. A same-user replay
        // (the legacy-localStorage migration) is a normal update.
        const existing = await prisma.customTask.findUnique({ where: { id } });

        if (existing && existing.userId !== user.id) {
            return NextResponse.json(
                { success: false, error: "That task id is already in use." },
                { status: 409 }
            );
        }

        const data = {
            name: name.trim(),
            course: course.trim(),
            due,
            dueAt: dueAtDate,
            dueFraction,
            sourceAnnouncementId,
        };

        const customTask = existing
            ? await prisma.customTask.update({ where: { id }, data })
            : await prisma.customTask.create({ data: { id, userId: user.id, ...data } });

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
            },
        });
    } catch (error) {
        console.error("❌ Failed to save custom task:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
