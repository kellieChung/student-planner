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

        const customizations = await prisma.taskCustomization.findMany({
            where: { userId: user.id },
            select: {
                taskId: true,
                startAt: true,
                course: true,
                nameOverride: true,
                typeOverride: true,
                dueAtOverride: true,
                notes: true,
                completed: true,
                completedAt: true,
                inProgress: true,
                deleted: true,
            },
        });

        return NextResponse.json({
            success: true,
            customizations: customizations.map((customization) => ({
                taskId: customization.taskId,
                startAt: customization.startAt
                    ? customization.startAt.toISOString().slice(0, 10)
                    : null,
                course: customization.course,
                nameOverride: customization.nameOverride,
                typeOverride: customization.typeOverride,
                dueAtOverride: customization.dueAtOverride
                    ? customization.dueAtOverride.toISOString()
                    : null,
                notes: customization.notes,
                completed: customization.completed,
                // Date-only, matching startAt above — WeeklyPlannerView.tsx
                // feeds this into lib/utils.ts's parseLocalDate (a plain
                // "YYYY-MM-DD" parser) as a startDate fallback for
                // calculateGridSpan; a full ISO instant here produced NaN
                // grid columns for every completed task with no explicit
                // Start Date override.
                completedAt: customization.completedAt
                    ? customization.completedAt.toISOString().slice(0, 10)
                    : null,
                inProgress: customization.inProgress,
                deleted: customization.deleted,
            })),
        });
    } catch (error) {
        console.error("❌ Failed to load task customizations:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
