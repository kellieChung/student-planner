import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDevAccountEmail } from "@/lib/devAccounts";
import { grantTaskXp } from "@/lib/xpAward";
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

        // Only the user's own tasks earn anything; name/course/type come from
        // stored rows, not the request.
        const result = await grantTaskXp(user.id, body.taskId, {
            due: isDateKey(body.due) ? body.due : undefined,
            completedAt: isDateKey(body.completedAt) ? body.completedAt : undefined,
        });

        if (!result) {
            return NextResponse.json({ success: false, error: "Task not found." }, { status: 404 });
        }

        return NextResponse.json({ success: true, ...result });
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
