import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = {
    params: Promise<{
        taskId: string;
    }>;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request, { params }: Params) {
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

        const { taskId } = await params;

        if (!taskId) {
            return NextResponse.json(
                { success: false, error: "'taskId' is required." },
                { status: 400 }
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

        const {
            startAt = null,
            course = null,
            notes = null,
        } = body as { startAt?: unknown; course?: unknown; notes?: unknown } | null ?? {};

        if (startAt !== null && (typeof startAt !== "string" || !DATE_ONLY.test(startAt))) {
            return NextResponse.json(
                { success: false, error: "'startAt' must be null or a 'YYYY-MM-DD' string." },
                { status: 400 }
            );
        }

        if (course !== null && typeof course !== "string") {
            return NextResponse.json(
                { success: false, error: "'course' must be null or a string." },
                { status: 400 }
            );
        }

        if (notes !== null && typeof notes !== "string") {
            return NextResponse.json(
                { success: false, error: "'notes' must be null or a string." },
                { status: 400 }
            );
        }

        const startAtDate = startAt ? new Date(`${startAt}T00:00:00.000Z`) : null;

        const customization = await prisma.taskCustomization.upsert({
            where: { userId_taskId: { userId: user.id, taskId } },
            update: { startAt: startAtDate, course, notes },
            create: { userId: user.id, taskId, startAt: startAtDate, course, notes },
            select: { taskId: true, startAt: true, course: true, notes: true },
        });

        return NextResponse.json({
            success: true,
            customization: {
                taskId: customization.taskId,
                startAt: customization.startAt
                    ? customization.startAt.toISOString().slice(0, 10)
                    : null,
                course: customization.course,
                notes: customization.notes,
            },
        });
    } catch (error) {
        console.error("❌ Failed to save task customization:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
