import { prisma } from "@/lib/prisma";
import { computeTaskXp, starlightForXp, type XpInput } from "@/lib/xp";
import { typeFromSubmissionTypes } from "@/lib/assignmentType";

export type TaskXpAward = {
    awarded: boolean;
    xp: number;
    starlightEarned: number;
    totalXp: number;
    starlight: number;
    lifetimeStarlight: number;
};

export type TaskXpSource = Omit<XpInput, "due" | "completedAt">;

type AwardOptions = { due?: string; completedAt?: string; starlight?: "full" | "none" };

// Awards XP and Starlight for completing a task, once per task, ever. The
// `NOT has taskId` filter and the increment are one statement, so a stale
// tab, a second device or a replayed request can't award the same task twice
// or overwrite the total.
async function awardTask(
    userId: string,
    taskId: string,
    xp: number,
    starlight: number
): Promise<{ awarded: boolean; starlightEarned: number; totalXp: number; starlight: number; lifetimeStarlight: number }> {
    return prisma.$transaction(async (tx) => {
        const [updated] = await tx.gamificationState.updateManyAndReturn({
            where: { userId, NOT: { awardedTaskIds: { has: taskId } } },
            data: { totalXp: { increment: xp }, awardedTaskIds: { push: taskId } },
            select: { totalXp: true },
        });

        let awarded = updated !== undefined;
        let totalXp = updated?.totalXp ?? 0;

        if (!updated) {
            const state = await tx.gamificationState.findUnique({ where: { userId }, select: { totalXp: true } });

            if (state) {
                totalXp = state.totalXp;
            } else {
                // First-ever award. Two racing ones both get here; the
                // loser's create hits the unique userId and grantTaskXp retries.
                const created = await tx.gamificationState.create({
                    data: { userId, totalXp: xp, awardedTaskIds: [taskId] },
                    select: { totalXp: true },
                });
                awarded = true;
                totalXp = created.totalXp;
            }
        }

        const starlightEarned = awarded ? starlight : 0;
        const select = { starlight: true, lifetimeStarlight: true };
        const chart = starlightEarned > 0
            ? await tx.starChart.upsert({
                where: { userId },
                create: { userId, starlight: starlightEarned, lifetimeStarlight: starlightEarned },
                update: { starlight: { increment: starlightEarned }, lifetimeStarlight: { increment: starlightEarned } },
                select,
            })
            : await tx.starChart.findUnique({ where: { userId }, select });

        return {
            awarded,
            starlightEarned,
            totalXp,
            starlight: chart?.starlight ?? 0,
            lifetimeStarlight: chart?.lifetimeStarlight ?? 0,
        };
    });
}

// Name/course and the AI type for each task, from stored rows only, in at
// most three queries for any number of tasks. Custom task ids always start
// with "custom-" (app/api/custom-tasks/route.ts enforces it), so each id only
// needs one table. Tasks that aren't the user's are missing from the map.
export async function loadTaskXpSources(userId: string, taskIds: string[]): Promise<Map<string, TaskXpSource>> {
    const customIds = taskIds.filter((id) => id.startsWith("custom-"));
    const canvasIds = taskIds.filter((id) => !id.startsWith("custom-"));

    const [assignments, customTasks, estimates] = await Promise.all([
        canvasIds.length > 0
            ? prisma.assignment.findMany({
                where: { userId, id: { in: canvasIds } },
                select: { id: true, name: true, submissionTypes: true, course: { select: { name: true, displayName: true } } },
            })
            : [],
        customIds.length > 0
            ? prisma.customTask.findMany({
                where: { userId, id: { in: customIds } },
                select: { id: true, name: true, course: true },
            })
            : [],
        taskIds.length > 0
            ? prisma.taskPlanningEstimate.findMany({
                where: { userId, taskId: { in: taskIds } },
                select: { taskId: true, assignmentType: true },
            })
            : [],
    ]);

    const typeByTaskId = new Map(estimates.map((estimate) => [estimate.taskId, estimate.assignmentType]));
    const sources = new Map<string, TaskXpSource>();

    for (const assignment of assignments) {
        sources.set(assignment.id, {
            name: assignment.name,
            course: assignment.course.displayName ?? assignment.course.name,
            canvasType: typeFromSubmissionTypes(assignment.submissionTypes, assignment.name),
            assignmentType: typeByTaskId.get(assignment.id),
        });
    }

    for (const customTask of customTasks) {
        sources.set(customTask.id, {
            name: customTask.name,
            course: customTask.course,
            assignmentType: typeByTaskId.get(customTask.id),
        });
    }

    return sources;
}

// Awards one task whose source rows were already loaded (loadTaskXpSources).
// `due`/`completedAt` are the user's local calendar days, which only the
// browser knows; they only affect the late penalty. `starlight: "none"`
// grants XP only (Canvas catch-up of old submissions).
export async function awardTaskXp(
    userId: string,
    taskId: string,
    source: TaskXpSource,
    options: AwardOptions
): Promise<TaskXpAward> {
    const xp = computeTaskXp({ ...source, due: options.due, completedAt: options.completedAt });
    const starlight = options.starlight === "none" ? 0 : starlightForXp(xp);

    let result;

    try {
        result = await awardTask(userId, taskId, xp, starlight);
    } catch (error) {
        // Two first-ever awards racing to create the row: the loser's
        // create hits the unique userId. Retrying sees the row.
        if ((error as { code?: string }).code === "P2002") {
            result = await awardTask(userId, taskId, xp, starlight);
        } else {
            throw error;
        }
    }

    return { ...result, xp: result.awarded ? xp : 0 };
}

// Shared by app/api/gamification/route.ts (a student checking a task off);
// lib/canvasCompletions.ts batches the loads itself. Returns null when the
// task isn't the user's.
export async function grantTaskXp(userId: string, taskId: string, options: AwardOptions): Promise<TaskXpAward | null> {
    const source = (await loadTaskXpSources(userId, [taskId])).get(taskId);

    return source ? awardTaskXp(userId, taskId, source, options) : null;
}
