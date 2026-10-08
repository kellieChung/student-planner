import { prisma } from "@/lib/prisma";
import { daysBetween, getTodayString, isDateKey, parseLocalDate } from "@/lib/utils";
import { awardTaskXp, loadTaskXpSources } from "@/lib/xpAward";

// One assignment's Canvas submission state, as canvas-extension/background.js
// reports it (pickAssignment's `submitted`/`completed_day`/`due_day`). The
// day keys are computed in the student's browser, the only place that knows
// their timezone.
export type CanvasCompletionItem = {
    courseCanvasId: string;
    assignmentCanvasId: string;
    submitted: boolean;
    completedDay: string | null;
    dueDay: string | null;
};

type TaskToComplete = {
    taskId: string;
    completedDay: string | null;
    dueDay: string | null;
};

// Null when the assignment carries no submission state at all (an extension
// build from before this feature): unknown, never "not submitted".
export function readCanvasCompletionItem(
    courseCanvasId: string,
    assignment: Record<string, unknown>
): CanvasCompletionItem | null {
    if (!assignment?.id || typeof assignment.submitted !== "boolean") return null;

    return {
        courseCanvasId,
        assignmentCanvasId: String(assignment.id),
        submitted: assignment.submitted,
        completedDay: isDateKey(assignment.completed_day) ? assignment.completed_day : null,
        dueDay: isDateKey(assignment.due_day) ? assignment.due_day : null,
    };
}

async function isCompleteFromCanvasOn(userId: string): Promise<boolean> {
    const settings = await prisma.plannerSettings.findUnique({
        where: { userId },
        select: { completeFromCanvas: true },
    });

    return settings?.completeFromCanvas ?? true;
}

// Caps one call's completions so the first check after this shipped (a
// whole term of submissions) doesn't stall a sync; the rest stay unflagged
// and are picked up by the next check.
const MAX_COMPLETIONS_PER_CALL = 40;

// Marks each task completed and awards its XP, skipping tasks the student
// already completed or deleted. Same stored shape as a manual check-off
// (app/api/task-customizations/[taskId]/route.ts): completedAt is the local
// day at UTC midnight. With `flagSubmitted`, the Assignments are flagged
// canvasSubmitted in one write at the end, so a failure partway leaves them
// as transitions for the next check instead of losing them.
// Only a recent submission earns Starlight (XP is always awarded). Turning
// the setting on, or the first check after connecting, reports every past
// submission at once, and that catch-up shouldn't be a Starlight windfall.
// 8 days leaves room for the user's timezone and a week offline.
function isRecentSubmission(completedDay: string | null): boolean {
    if (!completedDay || !isDateKey(completedDay)) return false;

    return daysBetween(parseLocalDate(getTodayString()), parseLocalDate(completedDay)) <= 8;
}

async function completeTasks(userId: string, tasks: TaskToComplete[], flagSubmitted: boolean) {
    if (tasks.length === 0) return { completedTaskIds: [] as string[], xpAwarded: 0, deferredCount: 0 };

    const batch = flagSubmitted ? tasks.slice(0, MAX_COMPLETIONS_PER_CALL) : tasks;
    const deferredCount = tasks.length - batch.length;
    const taskIds = batch.map((task) => task.taskId);

    const [customizations, sources] = await Promise.all([
        prisma.taskCustomization.findMany({
            where: { userId, taskId: { in: taskIds } },
            select: { taskId: true, completed: true, deleted: true },
        }),
        loadTaskXpSources(userId, taskIds),
    ]);

    const skip = new Set(
        customizations
            .filter((customization) => customization.completed || customization.deleted)
            .map((customization) => customization.taskId)
    );
    const hasCustomization = new Set(customizations.map((customization) => customization.taskId));
    const toComplete = batch.filter((task) => !skip.has(task.taskId));

    // Awards before the completion writes: awards are idempotent, so a
    // failure partway leaves the rest open and the next check redoes them.
    // The other order could mark a task completed that never got its XP.
    let xpAwarded = 0;

    for (const task of toComplete) {
        const source = sources.get(task.taskId);
        if (!source) continue;

        const award = await awardTaskXp(userId, task.taskId, source, {
            due: task.dueDay ?? undefined,
            completedAt: task.completedDay ?? undefined,
            starlight: isRecentSubmission(task.completedDay) ? "full" : "none",
        });

        xpAwarded += award.xp;
    }

    const completedAtFor = (task: TaskToComplete) =>
        task.completedDay ? new Date(`${task.completedDay}T00:00:00.000Z`) : null;
    const completion = { completed: true, completedFromCanvas: true, inProgress: false };

    const missing = toComplete.filter((task) => !hasCustomization.has(task.taskId));

    if (missing.length > 0) {
        const created = await prisma.taskCustomization.createManyAndReturn({
            data: missing.map((task) => ({ userId, taskId: task.taskId, completedAt: completedAtFor(task), ...completion })),
            skipDuplicates: true,
            select: { taskId: true },
        });
        const createdIds = new Set(created.map((row) => row.taskId));

        // Created by a concurrent request since the read above.
        for (const task of missing.filter((task) => !createdIds.has(task.taskId))) {
            const data = { completedAt: completedAtFor(task), ...completion };

            await prisma.taskCustomization.upsert({
                where: { userId_taskId: { userId, taskId: task.taskId } },
                create: { userId, taskId: task.taskId, ...data },
                update: data,
            });
        }
    }

    // One write per distinct completion day (usually one or two).
    const existingByDay = new Map<string | null, TaskToComplete[]>();

    for (const task of toComplete) {
        if (!hasCustomization.has(task.taskId)) continue;

        existingByDay.set(task.completedDay, [...(existingByDay.get(task.completedDay) ?? []), task]);
    }

    for (const sameDay of existingByDay.values()) {
        await prisma.taskCustomization.updateMany({
            where: { userId, taskId: { in: sameDay.map((task) => task.taskId) } },
            data: { completedAt: completedAtFor(sameDay[0]), ...completion },
        });
    }

    if (flagSubmitted) {
        await prisma.assignment.updateMany({
            where: { userId, id: { in: taskIds } },
            data: { canvasSubmitted: true },
        });
    }

    return { completedTaskIds: toComplete.map((task) => task.taskId), xpAwarded, deferredCount };
}

// Records Canvas's submission state on each already-synced Assignment and,
// when the setting is on, completes the ones that just became submitted.
// Only that flip completes a task, so a task the student un-checks in
// Lodestar stays un-checked on later checks. Assignments Lodestar hasn't
// synced yet are ignored; the next full sync creates them. `deferredCount`
// > 0 means some flips were left for the next call (the per-call cap), so
// the extension must resend instead of treating this state as delivered.
export async function applyCanvasCompletions(
    userId: string,
    canvasOrigin: string,
    items: CanvasCompletionItem[]
) {
    if (items.length === 0) return { completedTaskIds: [] as string[], xpAwarded: 0, deferredCount: 0 };

    // One read: the course is matched through the relation, not a second query.
    const assignments = await prisma.assignment.findMany({
        where: {
            userId,
            canvasId: { in: [...new Set(items.map((item) => item.assignmentCanvasId))] },
            course: { canvasOrigin, canvasId: { in: [...new Set(items.map((item) => item.courseCanvasId))] } },
        },
        select: { id: true, canvasId: true, canvasSubmitted: true, course: { select: { canvasId: true } } },
    });

    const assignmentByKey = new Map(
        assignments.map((assignment) => [`${assignment.course.canvasId}:${assignment.canvasId}`, assignment])
    );

    const nowSubmitted: TaskToComplete[] = [];
    const noLongerSubmittedIds: string[] = [];

    for (const item of items) {
        const assignment = assignmentByKey.get(`${item.courseCanvasId}:${item.assignmentCanvasId}`);

        if (!assignment || assignment.canvasSubmitted === item.submitted) continue;

        if (item.submitted) {
            nowSubmitted.push({ taskId: assignment.id, completedDay: item.completedDay, dueDay: item.dueDay });
        } else {
            noLongerSubmittedIds.push(assignment.id);
        }
    }

    if (noLongerSubmittedIds.length > 0) {
        await prisma.assignment.updateMany({
            where: { userId, id: { in: noLongerSubmittedIds } },
            data: { canvasSubmitted: false },
        });
    }

    // The common no-op check: nothing flipped, so skip the settings read.
    if (nowSubmitted.length === 0) return { completedTaskIds: [] as string[], xpAwarded: 0, deferredCount: 0 };

    if (!(await isCompleteFromCanvasOn(userId))) {
        // Recorded so turning the setting on later can backfill them.
        await prisma.assignment.updateMany({
            where: { userId, id: { in: nowSubmitted.map((task) => task.taskId) } },
            data: { canvasSubmitted: true },
        });

        return { completedTaskIds: [] as string[], xpAwarded: 0, deferredCount: 0 };
    }

    return completeTasks(userId, nowSubmitted, true);
}

// Turning the setting on catches up on everything Canvas already reported
// submitted while it was off. The submission day isn't stored, so these
// complete without a completedAt (and without a late penalty).
export async function backfillCanvasCompletions(userId: string) {
    const submitted = await prisma.assignment.findMany({
        where: { userId, canvasSubmitted: true },
        select: { id: true },
    });

    return completeTasks(
        userId,
        submitted.map((assignment) => ({ taskId: assignment.id, completedDay: null, dueDay: null })),
        false
    );
}
