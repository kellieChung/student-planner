import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDevAccountEmail } from "@/lib/devAccounts";
import { computeTaskXp } from "@/lib/xp";
import { isDateKey } from "@/lib/utils";

async function getUser() {
    const session = await auth();

    if (!session?.user?.email) return null;

    return prisma.user.findUnique({ where: { email: session.user.email } });
}

export async function GET() {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const state = await prisma.gamificationState.findUnique({
            where: { userId: user.id },
            select: { totalXp: true, awardedTaskIds: true },
        });

        return NextResponse.json({
            success: true,
            totalXp: state?.totalXp ?? 0,
            awardedTaskIds: state?.awardedTaskIds ?? [],
        });
    } catch (error) {
        console.error("Failed to load gamification state:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

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

export async function POST(request: Request) {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        let body: Record<string, unknown>;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
        }

        if (body.action !== "award" || typeof body.taskId !== "string" || !body.taskId) {
            return NextResponse.json(
                { success: false, error: "Expected { action: \"award\", taskId }." },
                { status: 400 }
            );
        }

        const taskId = body.taskId;

        // Only the user's own tasks earn anything; name/course come from the
        // stored row, not the request.
        const [assignment, customTask] = await Promise.all([
            prisma.assignment.findFirst({
                where: { id: taskId, userId: user.id },
                select: { name: true, course: { select: { name: true, displayName: true } } },
            }),
            prisma.customTask.findFirst({
                where: { id: taskId, userId: user.id },
                select: { name: true, course: true },
            }),
        ]);

        const task = assignment
            ? { name: assignment.name, course: assignment.course.displayName ?? assignment.course.name }
            : customTask
                ? { name: customTask.name, course: customTask.course }
                : null;

        if (!task) {
            return NextResponse.json({ success: false, error: "Task not found." }, { status: 404 });
        }

        const estimatedMinutes =
            typeof body.estimatedMinutes === "number" && Number.isFinite(body.estimatedMinutes)
                ? Math.min(Math.max(body.estimatedMinutes, 0), 600)
                : undefined;

        const xp = computeTaskXp({
            ...task,
            // The due and completion days are the user's local calendar days,
            // which only the browser knows; they only affect the late penalty.
            due: isDateKey(body.due) ? body.due : undefined,
            completedAt: isDateKey(body.completedAt) ? body.completedAt : undefined,
            estimatedMinutes,
        });

        let result;

        try {
            result = await awardTask(user.id, taskId, xp);
        } catch (error) {
            // Two first-ever awards racing to create the row: the loser's
            // upsert hits the unique userId. Retrying sees the row.
            if ((error as { code?: string }).code === "P2002") {
                result = await awardTask(user.id, taskId, xp);
            } else {
                throw error;
            }
        }

        return NextResponse.json({
            success: true,
            xp: result.awarded ? xp : 0,
            ...result,
        });
    } catch (error) {
        console.error("Failed to award XP:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

// Full replace of XP state — only for the dev dashboard's reset tools. Normal
// completion goes through POST (award) so a client can't set its own total.
export async function PATCH(request: Request) {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        if (!isDevAccountEmail(user.email)) {
            return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
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

        const { totalXp, awardedTaskIds } = body as { totalXp?: unknown; awardedTaskIds?: unknown };

        if (typeof totalXp !== "number" || !Number.isFinite(totalXp)) {
            return NextResponse.json(
                { success: false, error: "'totalXp' must be a number." },
                { status: 400 }
            );
        }

        if (!Array.isArray(awardedTaskIds) || !awardedTaskIds.every((id) => typeof id === "string")) {
            return NextResponse.json(
                { success: false, error: "'awardedTaskIds' must be an array of strings." },
                { status: 400 }
            );
        }

        const state = await prisma.gamificationState.upsert({
            where: { userId: user.id },
            create: { userId: user.id, totalXp, awardedTaskIds },
            update: { totalXp, awardedTaskIds },
            select: { totalXp: true, awardedTaskIds: true },
        });

        return NextResponse.json({
            success: true,
            totalXp: state.totalXp,
            awardedTaskIds: state.awardedTaskIds,
        });
    } catch (error) {
        console.error("Failed to save gamification state:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
