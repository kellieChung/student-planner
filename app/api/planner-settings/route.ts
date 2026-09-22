import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const SELECT = {
    autoAcceptAiTasks: true,
    lastRundownViewedAt: true,
} as const;

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

        const settings = await prisma.plannerSettings.findUnique({
            where: { userId: user.id },
            select: SELECT,
        });

        return NextResponse.json({
            success: true,
            autoAcceptAiTasks: settings?.autoAcceptAiTasks ?? false,
            lastRundownViewedAt: settings?.lastRundownViewedAt?.toISOString() ?? null,
        });
    } catch (error) {
        console.error("❌ Failed to load planner settings:", error);
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

        const input = body as Record<string, unknown>;

        // Present-key-only partial update (lib/townState.ts's convention)
        // — an absent key means "leave this field alone," so the Taskbar
        // toggle and the Rundown's dismiss action can never clobber each
        // other's field with a stale value.
        const data: { autoAcceptAiTasks?: boolean; lastRundownViewedAt?: Date | null } = {};

        if ("autoAcceptAiTasks" in input) {
            if (typeof input.autoAcceptAiTasks !== "boolean") {
                return NextResponse.json(
                    { success: false, error: "'autoAcceptAiTasks' must be a boolean." },
                    { status: 400 }
                );
            }
            data.autoAcceptAiTasks = input.autoAcceptAiTasks;
        }

        if ("lastRundownViewedAt" in input) {
            if (typeof input.lastRundownViewedAt === "string") {
                data.lastRundownViewedAt = new Date(input.lastRundownViewedAt);
            } else if (input.lastRundownViewedAt === null) {
                data.lastRundownViewedAt = null;
            } else {
                return NextResponse.json(
                    { success: false, error: "'lastRundownViewedAt' must be a string or null." },
                    { status: 400 }
                );
            }
        }

        const settings = await prisma.plannerSettings.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...data },
            update: data,
            select: SELECT,
        });

        return NextResponse.json({
            success: true,
            autoAcceptAiTasks: settings.autoAcceptAiTasks,
            lastRundownViewedAt: settings.lastRundownViewedAt?.toISOString() ?? null,
        });
    } catch (error) {
        console.error("❌ Failed to save planner settings:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
