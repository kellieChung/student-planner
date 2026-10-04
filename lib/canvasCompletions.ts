import { prisma } from "@/lib/prisma";
import { isDateKey } from "@/lib/utils";
import { grantTaskXp } from "@/lib/xpAward";

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
// day at UTC midnight. With `flagSubmitted`, each Assignment is flagged
// canvasSubmitted only once it's handled, so a failure partway leaves the
// rest as transitions for the next check instead of losing them.
async function completeTasks(userId: string, tasks: TaskToComplete[], flagSubmitted: boolean) {
    if (tasks.length === 0) return { completedTaskIds: [] as string[], xpAwarded: 0 };

    const batch = flagSubmitted ? tasks.slice(0, MAX_COMPLETIONS_PER_CALL) : tasks;
    const taskIds = batch.map((task) => task.taskId);

    const [customizations, estimates] = await Promise.all([
        prisma.taskCustomization.findMany({
            where: { userId, taskId: { in: taskIds } },
            select: { taskId: true, completed: true, deleted: true },
        }),
        prisma.taskPlanningEstimate.findMany({
            where: { userId, taskId: { in: taskIds } },
            select: { taskId: true, estimatedMinutes: true },
        }),
    ]);

    const skip = new Set(
        customizations
            .filter((customization) => customization.completed || customization.deleted)
            .map((customization) => customization.taskId)
    );
    const minutesByTask = new Map(estimates.map((estimate) => [estimate.taskId, estimate.estimatedMinutes]));

    if (flagSubmitted && skip.size > 0) {
        await prisma.assignment.updateMany({
            where: { userId, id: { in: [...skip] } },
            data: { canvasSubmitted: true },
        });
    }

    const completedTaskIds: string[] = [];
    let xpAwarded = 0;

    for (const task of batch) {
        if (skip.has(task.taskId)) continue;

        const completedAt = task.completedDay ? new Date(`${task.completedDay}T00:00:00.000Z`) : null;

        await prisma.taskCustomization.upsert({
            where: { userId_taskId: { userId, taskId: task.taskId } },
            create: { userId, taskId: task.taskId, completed: true, completedAt, completedFromCanvas: true, inProgress: false },
            update: { completed: true, completedAt, completedFromCanvas: true, inProgress: false },
        });

        const award = await grantTaskXp(userId, task.taskId, {
            due: task.dueDay ?? undefined,
            completedAt: task.completedDay ?? undefined,
            estimatedMinutes: minutesByTask.get(task.taskId),
        });

        if (flagSubmitted) {
            await prisma.assignment.updateMany({
                where: { userId, id: task.taskId },
                data: { canvasSubmitted: true },
            });
        }

        completedTaskIds.push(task.taskId);
        xpAwarded += award?.xp ?? 0;
    }

    return { completedTaskIds, xpAwarded };
}

// Records Canvas's submission state on each already-synced Assignment and,
// when the setting is on, completes the ones that just became submitted.
// Only that flip completes a task, so a task the student un-checks in
// Lodestar stays un-checked on later checks. Assignments Lodestar hasn't
// synced yet are ignored; the next full sync creates them.
export async function applyCanvasCompletions(
    userId: string,
    canvasOrigin: string,
    items: CanvasCompletionItem[]
) {
    if (items.length === 0) return { completedTaskIds: [] as string[], xpAwarded: 0 };

    const courses = await prisma.canvasCourse.findMany({
        where: {
            userId,
            canvasOrigin,
            canvasId: { in: [...new Set(items.map((item) => item.courseCanvasId))] },
        },
        select: { id: true, canvasId: true },
    });

    const courseIdByCanvasId = new Map(courses.map((course) => [course.canvasId, course.id]));

    const assignments = await prisma.assignment.findMany({
        where: {
            userId,
            courseId: { in: courses.map((course) => course.id) },
            canvasId: { in: [...new Set(items.map((item) => item.assignmentCanvasId))] },
        },
        select: { id: true, courseId: true, canvasId: true, canvasSubmitted: true },
    });

    const assignmentByKey = new Map(
        assignments.map((assignment) => [`${assignment.courseId}:${assignment.canvasId}`, assignment])
    );

    const nowSubmitted: TaskToComplete[] = [];
    const noLongerSubmittedIds: string[] = [];

    for (const item of items) {
        const courseId = courseIdByCanvasId.get(item.courseCanvasId);
        const assignment = courseId ? assignmentByKey.get(`${courseId}:${item.assignmentCanvasId}`) : undefined;

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

    if (!(await isCompleteFromCanvasOn(userId))) {
        // Recorded so turning the setting on later can backfill them.
        if (nowSubmitted.length > 0) {
            await prisma.assignment.updateMany({
                where: { userId, id: { in: nowSubmitted.map((task) => task.taskId) } },
                data: { canvasSubmitted: true },
            });
        }

        return { completedTaskIds: [] as string[], xpAwarded: 0 };
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
