import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Rolling window: keep the ranking responsive to recent behavior instead of
// averaging in a semester's worth of history. Mirrors
// lib/procrastinationHistory.ts's MAX_RECORDS_PER_TYPE (was enforced
// client-side via array slicing; now enforced here on insert).
const MAX_RECORDS_PER_TYPE = 12;

async function getAuthenticatedUser() {
    const session = await auth();

    if (!session?.user?.email) {
        return null;
    }

    return prisma.user.findUnique({
        where: { email: session.user.email },
    });
}

export async function GET() {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { success: false, error: "You must be logged in." },
            { status: 401 }
        );
    }

    const records = await prisma.procrastinationRecord.findMany({
        where: { userId: user.id },
    });

    return NextResponse.json({
        success: true,
        records: records.map((record) => ({
            taskType: record.taskType,
            addedAt: record.addedAt.toISOString(),
            dueAt: record.dueAt.toISOString(),
            completedAt: record.completedAt.toISOString(),
        })),
    });
}

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { success: false, error: "You must be logged in." },
            { status: 401 }
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

    const { taskType, addedAt, dueAt, completedAt } = body as {
        taskType?: unknown;
        addedAt?: unknown;
        dueAt?: unknown;
        completedAt?: unknown;
    } | null ?? {};

    const isValidDate = (value: unknown) =>
        typeof value === "string" && !Number.isNaN(new Date(value).getTime());

    if (typeof taskType !== "string" || !taskType.trim()) {
        return NextResponse.json(
            { success: false, error: "'taskType' is required." },
            { status: 400 }
        );
    }

    if (!isValidDate(addedAt) || !isValidDate(dueAt) || !isValidDate(completedAt)) {
        return NextResponse.json(
            { success: false, error: "'addedAt', 'dueAt', and 'completedAt' must be valid ISO datetime strings." },
            { status: 400 }
        );
    }

    const normalizedType = taskType.trim().toLowerCase();

    await prisma.procrastinationRecord.create({
        data: {
            userId: user.id,
            taskType: normalizedType,
            addedAt: new Date(addedAt as string),
            dueAt: new Date(dueAt as string),
            completedAt: new Date(completedAt as string),
        },
    });

    // Prune oldest rows for this (userId, taskType) beyond the cap.
    const rows = await prisma.procrastinationRecord.findMany({
        where: { userId: user.id, taskType: normalizedType },
        orderBy: { createdAt: "desc" },
        select: { id: true },
    });

    const staleIds = rows.slice(MAX_RECORDS_PER_TYPE).map((row) => row.id);

    if (staleIds.length > 0) {
        await prisma.procrastinationRecord.deleteMany({
            where: { id: { in: staleIds } },
        });
    }

    return NextResponse.json({ success: true });
}
