import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { expandOccurrences, RecurrenceFrequency, shiftDateKey } from "@/lib/recurrence";
import { getTodayString, isDateKey } from "@/lib/utils";

type Params = {
    params: Promise<{
        id: string;
    }>;
};

// The client asks for an 8-week window (at most ~57 daily occurrences); these
// bounds only stop a hand-made request from creating thousands of rows.
const MAX_OCCURRENCES_PER_REQUEST = 120;
const MAX_DAYS_AHEAD = 400;

// The client-driven occurrence materializer. dueAt/dueFraction for each
// requested date are computed client-side (lib/utils.ts's resolveDueTime,
// browser-timezone-dependent) — this route never does its own time math,
// only persists what it's given after re-validating the dates actually
// belong to the stored rule. Purely additive: an id that already has a
// CustomTask row (whatever its current state — completed, individually
// edited, or tombstoned-deleted via TaskCustomization) is never touched,
// which is what makes a deleted/edited occurrence stay that way across
// repeated materialization passes (e.g. a second open tab).
export async function POST(request: Request, { params }: Params) {
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

        const recurringTask = await prisma.recurringTask.findUnique({ where: { id } });

        if (!recurringTask || recurringTask.userId !== user.id) {
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

        const { occurrences } = body as { occurrences?: unknown } | null ?? {};

        if (!Array.isArray(occurrences) || occurrences.length > MAX_OCCURRENCES_PER_REQUEST) {
            return NextResponse.json(
                { success: false, error: `'occurrences' must be an array of at most ${MAX_OCCURRENCES_PER_REQUEST} entries.` },
                { status: 400 }
            );
        }

        // A paused series materializes nothing.
        if (!recurringTask.active) {
            return NextResponse.json({ success: true, customTasks: [] });
        }

        const latestAllowed = shiftDateKey(getTodayString(), MAX_DAYS_AHEAD);

        type RequestedOccurrence = { due: string; dueAt: string | null; dueFraction: number | null };
        const requested: RequestedOccurrence[] = [];

        for (const entry of occurrences) {
            const { due, dueAt = null, dueFraction = null } = entry as {
                due?: unknown;
                dueAt?: unknown;
                dueFraction?: unknown;
            } | null ?? {};

            if (!isDateKey(due)) {
                return NextResponse.json(
                    { success: false, error: "Each occurrence's 'due' must be a 'YYYY-MM-DD' string." },
                    { status: 400 }
                );
            }

            if (dueAt !== null && (typeof dueAt !== "string" || Number.isNaN(new Date(dueAt).getTime()))) {
                return NextResponse.json(
                    { success: false, error: "Each occurrence's 'dueAt' must be null or a valid ISO datetime string." },
                    { status: 400 }
                );
            }

            if (dueFraction !== null && typeof dueFraction !== "number") {
                return NextResponse.json(
                    { success: false, error: "Each occurrence's 'dueFraction' must be null or a number." },
                    { status: 400 }
                );
            }

            if (due > latestAllowed) continue;

            requested.push({ due, dueAt: dueAt as string | null, dueFraction: dueFraction as number | null });
        }

        if (requested.length === 0) {
            return NextResponse.json({ success: true, customTasks: [] });
        }

        // Defense in depth: never trust client-picked dates blindly. Any
        // requested date that doesn't actually satisfy the stored rule is
        // silently dropped rather than failing the whole batch (matching
        // this codebase's per-entry-degrade precedent in
        // lib/ai/findDuplicateTask.ts), since a boundary mismatch on one
        // date shouldn't block materializing the rest.
        const requestedDates = requested.map((occurrence) => occurrence.due);
        const validDates = new Set(
            expandOccurrences(
                {
                    frequency: recurringTask.frequency as RecurrenceFrequency,
                    interval: recurringTask.interval,
                    weekdays: recurringTask.weekdays,
                    startDate: recurringTask.startDate,
                    endDate: recurringTask.endDate,
                },
                requestedDates.reduce((min, d) => (d < min ? d : min)),
                requestedDates.reduce((max, d) => (d > max ? d : max))
            )
        );

        const validRequested = requested.filter((occurrence) => validDates.has(occurrence.due));

        if (validRequested.length === 0) {
            return NextResponse.json({ success: true, customTasks: [] });
        }

        const dueDates = validRequested.map((occurrence) => occurrence.due);

        // Existing rows are matched by series + due date, not only by the
        // deterministic id: a task converted into a series keeps its own id
        // and is already the first occurrence, so creating
        // custom-r<id>-<startDate> as well would duplicate it.
        const existingBefore = await prisma.customTask.findMany({
            where: { recurrenceId: recurringTask.id, due: { in: dueDates } },
            select: { due: true },
        });
        const existingDueSet = new Set(existingBefore.map((task) => task.due));
        const toCreate = validRequested.filter((occurrence) => !existingDueSet.has(occurrence.due));

        // skipDuplicates still covers an occurrence whose own due date was
        // edited (its id exists under the original date).
        await prisma.customTask.createMany({
            data: toCreate.map((occurrence) => ({
                id: `custom-r${recurringTask.id}-${occurrence.due}`,
                userId: user.id,
                name: recurringTask.name,
                course: recurringTask.course,
                due: occurrence.due,
                dueAt: occurrence.dueAt ? new Date(occurrence.dueAt) : null,
                dueFraction: occurrence.dueFraction,
                recurrenceId: recurringTask.id,
            })),
            skipDuplicates: true,
        });

        if (recurringTask.typeOverride !== null) {
            const newlyCreatedDates = dueDates.filter((due) => !existingDueSet.has(due));

            await Promise.all(
                newlyCreatedDates.map((due) =>
                    prisma.taskCustomization.upsert({
                        where: {
                            userId_taskId: {
                                userId: user.id,
                                taskId: `custom-r${recurringTask.id}-${due}`,
                            },
                        },
                        update: { typeOverride: recurringTask.typeOverride },
                        create: {
                            userId: user.id,
                            taskId: `custom-r${recurringTask.id}-${due}`,
                            typeOverride: recurringTask.typeOverride,
                        },
                    })
                )
            );
        }

        const customTasks = await prisma.customTask.findMany({
            where: { recurrenceId: recurringTask.id, due: { in: dueDates } },
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
                recurrenceId: task.recurrenceId,
                recurrenceOverridden: task.recurrenceOverridden,
            })),
        });
    } catch (error) {
        console.error("Failed to materialize recurring task occurrences:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
