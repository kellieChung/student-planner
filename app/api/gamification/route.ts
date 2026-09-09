import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
        console.error("❌ Failed to load gamification state:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

export async function PATCH(request: Request) {
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
        console.error("❌ Failed to save gamification state:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
