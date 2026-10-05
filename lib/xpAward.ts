import { prisma } from "@/lib/prisma";
import { computeTaskXp, starlightForXp } from "@/lib/xp";

export type TaskXpAward = {
    awarded: boolean;
    xp: number;
    starlightEarned: number;
    totalXp: number;
    starlight: number;
    lifetimeStarlight: number;
};

// Awards XP and Starlight for completing a task, once per task, ever. The
// dedup and both increments happen in one transaction against the stored
// awardedTaskIds, so a stale tab, a second device or a replayed request
// can't award the same task twice or overwrite the total.
async function awardTask(
    userId: string,
    taskId: string,
    xp: number,
    starlight: number
): Promise<{ awarded: boolean; starlightEarned: number; totalXp: number; starlight: number; lifetimeStarlight: number }> {
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
        let chart = await tx.starChart.upsert({ where: { userId }, create: { userId }, update: {} });
        let starlightEarned = 0;

        if (awarded && starlight > 0) {
            starlightEarned = starlight;
            chart = await tx.starChart.update({
                where: { userId },
                data: { starlight: { increment: starlight }, lifetimeStarlight: { increment: starlight } },
            });
        }

        const state = await tx.gamificationState.findUniqueOrThrow({
            where: { userId },
            select: { totalXp: true },
        });

        return {
            awarded,
            starlightEarned,
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
// penalty. `starlight: "none"` grants XP only (Canvas catch-up of old
// submissions). Returns null when the task isn't the user's.
export async function grantTaskXp(
    userId: string,
    taskId: string,
    options: { due?: string; completedAt?: string; starlight?: "full" | "none" }
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

    const xp = computeTaskXp({
        ...task,
        due: options.due,
        completedAt: options.completedAt,
        assignmentType: estimate?.assignmentType,
    });
    const starlight = options.starlight === "none" ? 0 : starlightForXp(xp);

    let result;

    try {
        result = await awardTask(userId, taskId, xp, starlight);
    } catch (error) {
        // Two first-ever awards racing to create the row: the loser's
        // upsert hits the unique userId. Retrying sees the row.
        if ((error as { code?: string }).code === "P2002") {
            result = await awardTask(userId, taskId, xp, starlight);
        } else {
            throw error;
        }
    }

    return { ...result, xp: result.awarded ? xp : 0 };
}
