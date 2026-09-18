import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RECURRENCE_FREQUENCIES } from "@/lib/recurrence";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^\d{2}:\d{2}$/;
const LABEL_TYPES = new Set(["HW", "R", "EXAM", "TODO"]);

function serializeRecurringTask(recurringTask: {
    id: string;
    name: string;
    course: string;
    typeOverride: string | null;
    frequency: string;
    interval: number;
    weekdays: number[];
    startDate: string;
    endDate: string | null;
    dueTime: string | null;
    active: boolean;
    createdAt: Date;
}) {
    return {
        id: recurringTask.id,
        name: recurringTask.name,
        course: recurringTask.course,
        typeOverride: recurringTask.typeOverride,
        frequency: recurringTask.frequency,
        interval: recurringTask.interval,
        weekdays: recurringTask.weekdays,
        startDate: recurringTask.startDate,
        endDate: recurringTask.endDate,
        dueTime: recurringTask.dueTime,
        active: recurringTask.active,
        createdAt: recurringTask.createdAt.toISOString(),
    };
}

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

        const recurringTasks = await prisma.recurringTask.findMany({
            where: { userId: user.id },
        });

        return NextResponse.json({
            success: true,
            recurringTasks: recurringTasks.map(serializeRecurringTask),
        });
    } catch (error) {
        console.error("❌ Failed to load recurring tasks:", error);
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
            name,
            course,
            typeOverride = null,
            frequency,
            interval = 1,
            weekdays = [],
            startDate,
            endDate = null,
            dueTime = null,
            dueAt = null,
            dueFraction = null,
            // When set, converts an existing custom task into this series'
            // first occurrence instead of creating a new row for it —
            // components/EditTaskModal.tsx's "Make this repeat" flow.
            anchorTaskId = null,
        } = body as {
            name?: unknown;
            course?: unknown;
            typeOverride?: unknown;
            frequency?: unknown;
            interval?: unknown;
            weekdays?: unknown;
            startDate?: unknown;
            endDate?: unknown;
            dueTime?: unknown;
            dueAt?: unknown;
            dueFraction?: unknown;
            anchorTaskId?: unknown;
        } | null ?? {};

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

        if (typeOverride !== null && (typeof typeOverride !== "string" || !LABEL_TYPES.has(typeOverride))) {
            return NextResponse.json(
                { success: false, error: "'typeOverride' must be null or one of 'HW', 'R', 'EXAM', 'TODO'." },
                { status: 400 }
            );
        }

        if (typeof frequency !== "string" || !RECURRENCE_FREQUENCIES.has(frequency as never)) {
            return NextResponse.json(
                { success: false, error: "'frequency' must be one of 'daily', 'weekly', 'monthly'." },
                { status: 400 }
            );
        }

        if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 1) {
            return NextResponse.json(
                { success: false, error: "'interval' must be a positive integer." },
                { status: 400 }
            );
        }

        if (
            !Array.isArray(weekdays) ||
            !weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        ) {
            return NextResponse.json(
                { success: false, error: "'weekdays' must be an array of integers 0-6." },
                { status: 400 }
            );
        }

        if (frequency === "weekly" && weekdays.length === 0) {
            return NextResponse.json(
                { success: false, error: "'weekdays' must be non-empty for a weekly recurrence." },
                { status: 400 }
            );
        }

        if (typeof startDate !== "string" || !DATE_ONLY.test(startDate)) {
            return NextResponse.json(
                { success: false, error: "'startDate' must be a 'YYYY-MM-DD' string." },
                { status: 400 }
            );
        }

        if (endDate !== null && (typeof endDate !== "string" || !DATE_ONLY.test(endDate))) {
            return NextResponse.json(
                { success: false, error: "'endDate' must be null or a 'YYYY-MM-DD' string." },
                { status: 400 }
            );
        }

        if (endDate !== null && endDate < startDate) {
            return NextResponse.json(
                { success: false, error: "'endDate' cannot be before 'startDate'." },
                { status: 400 }
            );
        }

        if (dueTime !== null && (typeof dueTime !== "string" || !TIME_ONLY.test(dueTime))) {
            return NextResponse.json(
                { success: false, error: "'dueTime' must be null or an 'HH:MM' string." },
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

        if (anchorTaskId !== null && typeof anchorTaskId !== "string") {
            return NextResponse.json(
                { success: false, error: "'anchorTaskId' must be null or a string." },
                { status: 400 }
            );
        }

        if (anchorTaskId !== null) {
            const anchorTask = await prisma.customTask.findUnique({ where: { id: anchorTaskId } });

            if (!anchorTask || anchorTask.userId !== user.id) {
                return NextResponse.json(
                    { success: false, error: "Anchor task not found." },
                    { status: 404 }
                );
            }

            if (anchorTask.recurrenceId) {
                return NextResponse.json(
                    { success: false, error: "That task is already part of a recurring series." },
                    { status: 409 }
                );
            }
        }

        const trimmedName = name.trim();
        const trimmedCourse = course.trim();

        const { recurringTask, customTask } = await prisma.$transaction(async (tx) => {
            const recurringTask = await tx.recurringTask.create({
                data: {
                    userId: user.id,
                    name: trimmedName,
                    course: trimmedCourse,
                    typeOverride,
                    frequency,
                    interval,
                    weekdays,
                    startDate,
                    endDate,
                    dueTime,
                },
            });

            // Converting an existing task re-points its own row instead of
            // creating a duplicate first occurrence — that row already is
            // the first occurrence.
            const customTask = anchorTaskId
                ? await tx.customTask.update({
                    where: { id: anchorTaskId },
                    data: { recurrenceId: recurringTask.id },
                })
                : await tx.customTask.create({
                    data: {
                        id: `custom-r${recurringTask.id}-${startDate}`,
                        userId: user.id,
                        name: trimmedName,
                        course: trimmedCourse,
                        due: startDate,
                        dueAt: dueAtDate,
                        dueFraction,
                        recurrenceId: recurringTask.id,
                    },
                });

            if (typeOverride !== null) {
                await tx.taskCustomization.upsert({
                    where: { userId_taskId: { userId: user.id, taskId: customTask.id } },
                    update: { typeOverride },
                    create: { userId: user.id, taskId: customTask.id, typeOverride },
                });
            }

            return { recurringTask, customTask };
        });

        return NextResponse.json({
            success: true,
            recurringTask: serializeRecurringTask(recurringTask),
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
            },
        });
    } catch (error) {
        console.error("❌ Failed to create recurring task:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
