import { prisma } from "@/lib/prisma";
import { computeTaskXp } from "@/lib/xp";

export type TaskXpAward = {
    awarded: boolean;
    xp: number;
    totalXp: number;
    starlight: number;
    lifetimeStarlight: number;
};

// Awards XP (and the same amount of Starlight) for completing a task, once
// per task, ever. The dedup and both increments happen in one transaction
// against the stored awardedTaskIds, so a stale tab, a second device or a
// replayed request can't award the same task twice or overwrite the total.
async function awardTask(
    userId: string,
    taskId: string,
    xp: number
): Promise<{ awarded: boolean; totalXp: number; starlight: number; lifetimeStarlight: number }> {
    return prisma.$transaction(async (tx) => {
        await tx.gamificationState.upsert({
            where: { userId },
            create: { userId, totalXp: 0, awardedTaskIds: [] },
            update: {},
        });

        const { count } = await tx.gamificationState.updateMany({
            where: { userId, NOT: { awardedTaskIds: { has: taskId } } },
            data: { totalXp: { increment: xp }, awardedTaskIds: { push: taskId } },
        });

        const awarded = count === 1;

        const chart = awarded
            ? await tx.starChart.upsert({
                where: { userId },
                create: { userId, starlight: xp, lifetimeStarlight: xp },
                update: { starlight: { increment: xp }, lifetimeStarlight: { increment: xp } },
            })
            : await tx.starChart.upsert({ where: { userId }, create: { userId }, update: {} });

        const state = await tx.gamificationState.findUniqueOrThrow({
            where: { userId },
            select: { totalXp: true },
        });

        return {
            awarded,
            totalXp: state.totalXp,
            starlight: chart.starlight,
            lifetimeStarlight: chart.lifetimeStarlight,
        };
    });
}

// Shared by app/api/gamification/route.ts (a student checking a task off)
// and lib/canvasCompletions.ts (Canvas reporting it submitted). Name/course
// and the AI type always come from stored rows. `due`/`completedAt` are the user's local
// calendar days, which only the browser knows; they only affect the late
// penalty. Returns null when the task isn't the user's.
export async function grantTaskXp(
    userId: string,
    taskId: string,
    options: { due?: string; completedAt?: string }
): Promise<TaskXpAward | null> {
    const [assignment, customTask, estimate] = await Promise.all([
        prisma.assignment.findFirst({
            where: { id: taskId, userId },
            select: { name: true, course: { select: { name: true, displayName: true } } },
        }),
        prisma.customTask.findFirst({
            where: { id: taskId, userId },
            select: { name: true, course: true },
        }),
        prisma.taskPlanningEstimate.findUnique({
            where: { userId_taskId: { userId, taskId } },
            select: { assignmentType: true },
        }),
    ]);

    const task = assignment
        ? { name: assignment.name, course: assignment.course.displayName ?? assignment.course.name }
        : customTask
            ? { name: customTask.name, course: customTask.course }
            : null;

    if (!task) return null;

    const xp = computeTaskXp({ ...task, ...options, assignmentType: estimate?.assignmentType });

    let result;

    try {
        result = await awardTask(userId, taskId, xp);
    } catch (error) {
        // Two first-ever awards racing to create the row: the loser's
        // upsert hits the unique userId. Retrying sees the row.
        if ((error as { code?: string }).code === "P2002") {
            result = await awardTask(userId, taskId, xp);
        } else {
            throw error;
        }
    }

    return { ...result, xp: result.awarded ? xp : 0 };
}
