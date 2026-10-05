import { prisma } from "@/lib/prisma";
import { computeTaskXp, starlightForXp } from "@/lib/xp";
import { resolveClientToday } from "@/lib/utils";

// Students can create and check off their own tasks, so those pay at most
// this much Starlight a day (XP is uncapped).
export const CUSTOM_TASK_DAILY_STARLIGHT = 30;

export type TaskXpAward = {
    awarded: boolean;
    xp: number;
    starlightEarned: number;
    totalXp: number;
    starlight: number;
    lifetimeStarlight: number;
};

type StarlightGrant =
    | { kind: "full"; amount: number }
    | { kind: "none" }
    // Counted against the custom-task cap for `day` (the user's local day).
    | { kind: "custom"; amount: number; day: string };

// Awards XP and Starlight for completing a task, once per task, ever. The
// dedup and both increments happen in one transaction against the stored
// awardedTaskIds, so a stale tab, a second device or a replayed request
// can't award the same task twice or overwrite the total. The dedup update
// also row-locks the user's state, so concurrent awards serialize and the
// custom-task cap below can't be overrun.
async function awardTask(
    userId: string,
    taskId: string,
    xp: number,
    grant: StarlightGrant
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

        if (awarded && grant.kind !== "none") {
            let capData = {};

            if (grant.kind === "custom") {
                // An older day counts against the stored one, so alternating
                // day keys can't reset the cap.
                const isNewDay = !chart.customStarlightDay || grant.day > chart.customStarlightDay;
                const used = isNewDay ? 0 : chart.customStarlightToday;

                starlightEarned = Math.max(0, Math.min(grant.amount, CUSTOM_TASK_DAILY_STARLIGHT - used));
                capData = isNewDay
                    ? { customStarlightDay: grant.day, customStarlightToday: starlightEarned }
                    : { customStarlightToday: { increment: starlightEarned } };
            } else {
                starlightEarned = grant.amount;
            }

            chart = await tx.starChart.update({
                where: { userId },
                data: {
                    starlight: { increment: starlightEarned },
                    lifetimeStarlight: { increment: starlightEarned },
                    ...capData,
                },
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

// Tasks accepted from an announcement scan are real schoolwork stored as
// custom tasks, so they skip the cap. sourceAnnouncementId is client-set
// (POST /api/custom-tasks), so it only counts while there are at least as
// many accepted suggestions for that announcement as tasks claiming it.
async function isAcceptedAnnouncementTask(userId: string, sourceAnnouncementId: string | null): Promise<boolean> {
    if (!sourceAnnouncementId) return false;

    const [accepted, claiming] = await Promise.all([
        prisma.announcementSuggestionReview.count({ where: { userId, sourceAnnouncementId, status: "accepted" } }),
        prisma.customTask.count({ where: { userId, sourceAnnouncementId } }),
    ]);

    return accepted > 0 && claiming <= accepted;
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
            select: { name: true, course: true, sourceAnnouncementId: true },
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
    const amount = starlightForXp(xp);
    const capped = customTask && !assignment && !(await isAcceptedAnnouncementTask(userId, customTask.sourceAnnouncementId));
    const grant: StarlightGrant = options.starlight === "none"
        ? { kind: "none" }
        : capped
            ? { kind: "custom", amount, day: resolveClientToday(options.completedAt) }
            : { kind: "full", amount };

    let result;

    try {
        result = await awardTask(userId, taskId, xp, grant);
    } catch (error) {
        // Two first-ever awards racing to create the row: the loser's
        // upsert hits the unique userId. Retrying sees the row.
        if ((error as { code?: string }).code === "P2002") {
            result = await awardTask(userId, taskId, xp, grant);
        } else {
            throw error;
        }
    }

    return { ...result, xp: result.awarded ? xp : 0 };
}
