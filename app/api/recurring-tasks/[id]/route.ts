import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { expandOccurrences, RECURRENCE_FREQUENCIES, RecurrenceFrequency, shiftDateKey } from "@/lib/recurrence";
import { isDateKey, resolveClientToday } from "@/lib/utils";

type Params = {
    params: Promise<{
        id: string;
    }>;
};

const TIME_ONLY = /^\d{2}:\d{2}$/;
const LABEL_TYPES = new Set(["HW", "R", "EXAM", "TODO"]);

async function getOwnedRecurringTask(userId: string, id: string) {
    const recurringTask = await prisma.recurringTask.findUnique({ where: { id } });

    return recurringTask && recurringTask.userId === userId ? recurringTask : null;
}

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

// Tombstones (TaskCustomization.deleted = true) every occurrence of
// `recurringTaskId` due on/after `fromDate`, skipping anything already
// completed (a completed occurrence is history, never retroactively
// hidden). `includeOverridden` controls whether a single-occurrence
// customization (CustomTask.recurrenceOverridden) is also swept up — false
// for a "this and following" *field edit* (an explicit per-occurrence
// customization should survive an unrelated series edit), true for an
// explicit delete (deleting forward, or the whole series, is unconditional).
async function tombstoneFutureOccurrences(
    userId: string,
    recurringTaskId: string,
    fromDate: string,
    { includeOverridden = false }: { includeOverridden?: boolean } = {}
) {
    const candidates = await prisma.customTask.findMany({
        where: {
            recurrenceId: recurringTaskId,
            due: { gte: fromDate },
            ...(includeOverridden ? {} : { recurrenceOverridden: false }),
        },
        select: { id: true },
    });

    if (candidates.length === 0) return;

    const candidateIds = candidates.map((task) => task.id);

    const completed = await prisma.taskCustomization.findMany({
        where: { userId, taskId: { in: candidateIds }, completed: true },
        select: { taskId: true },
    });
    const completedIds = new Set(completed.map((c) => c.taskId));

    const survivors = candidateIds.filter((taskId) => !completedIds.has(taskId));

    await Promise.all(
        survivors.map((taskId) =>
            prisma.taskCustomization.upsert({
                where: { userId_taskId: { userId, taskId } },
                update: { deleted: true },
                create: { userId, taskId, deleted: true },
            })
        )
    );
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

        const { id } = await params;
        const existing = await getOwnedRecurringTask(user.id, id);

        if (!existing) {
            return NextResponse.json(
                { success: false, error: "Recurring task not found." },
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
            deleteFrom,
            applyFromDate,
            occurrenceUpdates = [],
            name,
            course,
            typeOverride,
            frequency,
            interval,
            weekdays,
            startDate,
            endDate,
            dueTime,
            active,
            today: clientToday,
        } = body as {
            deleteFrom?: unknown;
            applyFromDate?: unknown;
            occurrenceUpdates?: unknown;
            name?: unknown;
            course?: unknown;
            typeOverride?: unknown;
            frequency?: unknown;
            interval?: unknown;
            weekdays?: unknown;
            startDate?: unknown;
            endDate?: unknown;
            dueTime?: unknown;
            active?: unknown;
            today?: unknown;
        } | null ?? {};

        // Mode 1: "delete this and following" — shrink the rule and
        // tombstone every occurrence from that date forward. Reuses the
        // rule-shrink mechanism rather than a separate delete endpoint.
        if (deleteFrom !== undefined) {
            if (!isDateKey(deleteFrom)) {
                return NextResponse.json(
                    { success: false, error: "'deleteFrom' must be a 'YYYY-MM-DD' string." },
                    { status: 400 }
                );
            }

            const updated = await prisma.recurringTask.update({
                where: { id },
                data: { endDate: shiftDateKey(deleteFrom, -1) },
            });

            await tombstoneFutureOccurrences(user.id, id, deleteFrom, { includeOverridden: true });

            return NextResponse.json({ success: true, recurringTask: serializeRecurringTask(updated) });
        }

        // Mode 2: "this and following" field edit — only the series'
        // mutable display fields (name/course/typeOverride/dueTime), never
        // the rule shape itself.
        if (applyFromDate !== undefined) {
            if (!isDateKey(applyFromDate)) {
                return NextResponse.json(
                    { success: false, error: "'applyFromDate' must be a 'YYYY-MM-DD' string." },
                    { status: 400 }
                );
            }

            if (
                frequency !== undefined || interval !== undefined ||
                weekdays !== undefined || startDate !== undefined
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "The recurrence pattern (frequency/interval/weekdays/startDate) can't change via 'applyFromDate' — edit the series itself instead.",
                    },
                    { status: 400 }
                );
            }

            const templateData: Record<string, unknown> = {};

            if (name !== undefined) {
                if (typeof name !== "string" || !name.trim()) {
                    return NextResponse.json(
                        { success: false, error: "'name' must be a non-empty string." },
                        { status: 400 }
                    );
                }
                templateData.name = name.trim();
            }

            if (course !== undefined) {
                if (typeof course !== "string" || !course.trim()) {
                    return NextResponse.json(
                        { success: false, error: "'course' must be a non-empty string." },
                        { status: 400 }
                    );
                }
                templateData.course = course.trim();
            }

            if (typeOverride !== undefined) {
                if (typeOverride !== null && (typeof typeOverride !== "string" || !LABEL_TYPES.has(typeOverride))) {
                    return NextResponse.json(
                        { success: false, error: "'typeOverride' must be null or one of 'HW', 'R', 'EXAM', 'TODO'." },
                        { status: 400 }
                    );
                }
                templateData.typeOverride = typeOverride;
            }

            if (dueTime !== undefined) {
                if (dueTime !== null && (typeof dueTime !== "string" || !TIME_ONLY.test(dueTime))) {
                    return NextResponse.json(
                        { success: false, error: "'dueTime' must be null or an 'HH:MM' string." },
                        { status: 400 }
                    );
                }
                templateData.dueTime = dueTime;
            }

            if (!Array.isArray(occurrenceUpdates)) {
                return NextResponse.json(
                    { success: false, error: "'occurrenceUpdates' must be an array." },
                    { status: 400 }
                );
            }

            const occurrenceUpdateMap = new Map<string, { dueAt: string | null; dueFraction: number | null }>();
            for (const entry of occurrenceUpdates) {
                const { id: taskId, dueAt = null, dueFraction = null } = entry as {
                    id?: unknown;
                    dueAt?: unknown;
                    dueFraction?: unknown;
                } | null ?? {};

                if (typeof taskId !== "string") {
                    return NextResponse.json(
                        { success: false, error: "Each 'occurrenceUpdates' entry needs a string 'id'." },
                        { status: 400 }
                    );
                }
                if (dueAt !== null && (typeof dueAt !== "string" || Number.isNaN(new Date(dueAt).getTime()))) {
                    return NextResponse.json(
                        { success: false, error: "Each 'occurrenceUpdates' entry's 'dueAt' must be null or a valid ISO datetime string." },
                        { status: 400 }
                    );
                }
                if (dueFraction !== null && typeof dueFraction !== "number") {
                    return NextResponse.json(
                        { success: false, error: "Each 'occurrenceUpdates' entry's 'dueFraction' must be null or a number." },
                        { status: 400 }
                    );
                }

                occurrenceUpdateMap.set(taskId, { dueAt: dueAt as string | null, dueFraction: dueFraction as number | null });
            }

            const updated = Object.keys(templateData).length > 0
                ? await prisma.recurringTask.update({ where: { id }, data: templateData })
                : existing;

            const candidates = await prisma.customTask.findMany({
                where: { recurrenceId: id, due: { gte: applyFromDate }, recurrenceOverridden: false },
                select: { id: true },
            });
            const candidateIds = candidates.map((task) => task.id);

            const completed = await prisma.taskCustomization.findMany({
                where: { userId: user.id, taskId: { in: candidateIds }, completed: true },
                select: { taskId: true },
            });
            const completedIds = new Set(completed.map((c) => c.taskId));
            const survivorIds = candidateIds.filter((taskId) => !completedIds.has(taskId));

            await Promise.all(
                survivorIds.map((taskId) => {
                    const data: Record<string, unknown> = {};

                    if (templateData.name !== undefined) data.name = templateData.name;
                    if (templateData.course !== undefined) data.course = templateData.course;

                    const override = occurrenceUpdateMap.get(taskId);
                    if (override) {
                        data.dueAt = override.dueAt ? new Date(override.dueAt) : null;
                        data.dueFraction = override.dueFraction;
                    }

                    return Object.keys(data).length > 0
                        ? prisma.customTask.update({ where: { id: taskId }, data })
                        : Promise.resolve();
                })
            );

            if (templateData.typeOverride !== undefined) {
                await Promise.all(
                    survivorIds.map((taskId) =>
                        prisma.taskCustomization.upsert({
                            where: { userId_taskId: { userId: user.id, taskId } },
                            update: { typeOverride: templateData.typeOverride as string | null },
                            create: { userId: user.id, taskId, typeOverride: templateData.typeOverride as string | null },
                        })
                    )
                );
            }

            return NextResponse.json({
                success: true,
                recurringTask: serializeRecurringTask(updated),
                updatedOccurrenceIds: survivorIds,
            });
        }

        // Mode 3: plain template edit (pattern change and/or pause/resume).
        const data: Record<string, unknown> = {};

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return NextResponse.json(
                    { success: false, error: "'name' must be a non-empty string." },
                    { status: 400 }
                );
            }
            data.name = name.trim();
        }

        if (course !== undefined) {
            if (typeof course !== "string" || !course.trim()) {
                return NextResponse.json(
                    { success: false, error: "'course' must be a non-empty string." },
                    { status: 400 }
                );
            }
            data.course = course.trim();
        }

        if (typeOverride !== undefined) {
            if (typeOverride !== null && (typeof typeOverride !== "string" || !LABEL_TYPES.has(typeOverride))) {
                return NextResponse.json(
                    { success: false, error: "'typeOverride' must be null or one of 'HW', 'R', 'EXAM', 'TODO'." },
                    { status: 400 }
                );
            }
            data.typeOverride = typeOverride;
        }

        if (frequency !== undefined) {
            if (typeof frequency !== "string" || !RECURRENCE_FREQUENCIES.has(frequency as never)) {
                return NextResponse.json(
                    { success: false, error: "'frequency' must be one of 'daily', 'weekly', 'monthly'." },
                    { status: 400 }
                );
            }
            data.frequency = frequency;
        }

        if (interval !== undefined) {
            if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 1) {
                return NextResponse.json(
                    { success: false, error: "'interval' must be a positive integer." },
                    { status: 400 }
                );
            }
            data.interval = interval;
        }

        if (weekdays !== undefined) {
            if (
                !Array.isArray(weekdays) ||
                !weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            ) {
                return NextResponse.json(
                    { success: false, error: "'weekdays' must be an array of integers 0-6." },
                    { status: 400 }
                );
            }
            data.weekdays = weekdays;
        }

        if (startDate !== undefined) {
            if (!isDateKey(startDate)) {
                return NextResponse.json(
                    { success: false, error: "'startDate' must be a 'YYYY-MM-DD' string." },
                    { status: 400 }
                );
            }
            data.startDate = startDate;
        }

        if (endDate !== undefined) {
            if (endDate !== null && !isDateKey(endDate)) {
                return NextResponse.json(
                    { success: false, error: "'endDate' must be null or a 'YYYY-MM-DD' string." },
                    { status: 400 }
                );
            }
            data.endDate = endDate;
        }

        if (dueTime !== undefined) {
            if (dueTime !== null && (typeof dueTime !== "string" || !TIME_ONLY.test(dueTime))) {
                return NextResponse.json(
                    { success: false, error: "'dueTime' must be null or an 'HH:MM' string." },
                    { status: 400 }
                );
            }
            data.dueTime = dueTime;
        }

        if (active !== undefined) {
            if (typeof active !== "boolean") {
                return NextResponse.json(
                    { success: false, error: "'active' must be a boolean." },
                    { status: 400 }
                );
            }
            data.active = active;
        }

        const nextStart = (data.startDate as string | undefined) ?? existing.startDate;
        const nextEnd = data.endDate !== undefined ? (data.endDate as string | null) : existing.endDate;

        if (nextEnd && nextEnd < nextStart) {
            return NextResponse.json(
                { success: false, error: "The end date can't be before the start date." },
                { status: 400 }
            );
        }

        const updated = Object.keys(data).length > 0
            ? await prisma.recurringTask.update({ where: { id }, data })
            : existing;

        // A rule-shape change may leave some already-materialized future
        // occurrences no longer matching the new pattern — purge those
        // (skipping completed/individually-edited ones) so the next
        // materialization pass regenerates cleanly against the new rule.
        const ruleChanged = ["frequency", "interval", "weekdays", "startDate", "endDate"].some(
            (field) => field in data
        );

        if (ruleChanged) {
            const today = resolveClientToday(clientToday);
            const horizonEnd = shiftDateKey(today, 365);
            const validDates = new Set(
                expandOccurrences(
                    {
                        frequency: updated.frequency as RecurrenceFrequency,
                        interval: updated.interval,
                        weekdays: updated.weekdays,
                        startDate: updated.startDate,
                        endDate: updated.endDate,
                    },
                    today,
                    horizonEnd
                )
            );

            const futureOccurrences = await prisma.customTask.findMany({
                where: { recurrenceId: id, due: { gte: today }, recurrenceOverridden: false },
                select: { id: true, due: true },
            });
            const invalidIds = futureOccurrences
                .filter((task) => !task.due || !validDates.has(task.due))
                .map((task) => task.id);

            if (invalidIds.length > 0) {
                const completed = await prisma.taskCustomization.findMany({
                    where: { userId: user.id, taskId: { in: invalidIds }, completed: true },
                    select: { taskId: true },
                });
                const completedIds = new Set(completed.map((c) => c.taskId));
                const survivors = invalidIds.filter((taskId) => !completedIds.has(taskId));

                await Promise.all(
                    survivors.map((taskId) =>
                        prisma.taskCustomization.upsert({
                            where: { userId_taskId: { userId: user.id, taskId } },
                            update: { deleted: true },
                            create: { userId: user.id, taskId, deleted: true },
                        })
                    )
                );
            }
        }

        return NextResponse.json({ success: true, recurringTask: serializeRecurringTask(updated) });
    } catch (error) {
        console.error("Failed to update recurring task:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request, { params }: Params) {
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

        const { id } = await params;
        const existing = await getOwnedRecurringTask(user.id, id);

        if (!existing) {
            return NextResponse.json(
                { success: false, error: "Recurring task not found." },
                { status: 404 }
            );
        }

        // Tombstone every non-completed future occurrence, unconditionally
        // (a whole-series delete isn't the kind of edit an individual
        // customization should survive). Past/completed occurrences are
        // left alone and simply become standalone tasks once the series
        // row below is deleted (recurrenceId: onDelete SetNull).
        const today = resolveClientToday(new URL(request.url).searchParams.get("today"));

        await tombstoneFutureOccurrences(user.id, id, today, { includeOverridden: true });

        await prisma.recurringTask.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete recurring task:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
