import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { ProposedTask } from "@/types/proposedTask";

// How many "Added from Canvas" items to return — a defensive cap, not a
// real pagination boundary (see the Rundown screen's known edge case: a
// restored course's Assignment rows get fresh createdAt values and could
// otherwise flood this list).
const ADDED_FROM_CANVAS_LIMIT = 200;

// Feeds the Rundown screen and the Still-Deciding panel. Deliberately does
// NOT run the AI detection pass itself — that only happens via the
// manually-triggered, rate-limited app/api/ai/analyze-announcements route.
// This route only reads what's already been persisted.
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

        const [reviews, plannerSettings, deletedTaskIds] = await Promise.all([
            prisma.announcementSuggestionReview.findMany({
                where: {
                    userId: user.id,
                    status: { in: ["pending", "maybe"] },
                    taskSnapshot: { not: Prisma.JsonNull },
                },
                orderBy: { createdAt: "desc" },
            }),
            prisma.plannerSettings.findUnique({
                where: { userId: user.id },
                select: { lastRundownViewedAt: true },
            }),
            prisma.taskCustomization.findMany({
                where: { userId: user.id, deleted: true },
                select: { taskId: true },
            }),
        ]);

        const pending = reviews
            .filter((review) => review.status === "pending" && review.taskSnapshot)
            .map((review) => ({
                ...(review.taskSnapshot as unknown as ProposedTask),
                reviewStatus: "pending" as const,
                firstSeenAt: review.createdAt.toISOString(),
            }));

        const maybe = reviews
            .filter((review) => review.status === "maybe" && review.taskSnapshot)
            .map((review) => ({
                ...(review.taskSnapshot as unknown as ProposedTask),
                reviewStatus: "maybe" as const,
                firstSeenAt: review.createdAt.toISOString(),
            }));

        const deletedTaskIdSet = new Set(deletedTaskIds.map((row) => row.taskId));
        const lastViewed = plannerSettings?.lastRundownViewedAt ?? new Date(0);

        const newAssignments = await prisma.assignment.findMany({
            where: {
                userId: user.id,
                createdAt: { gt: lastViewed },
                course: { hidden: false },
            },
            include: { course: true },
            orderBy: { createdAt: "desc" },
            take: ADDED_FROM_CANVAS_LIMIT,
        });

        const addedFromCanvas = newAssignments
            .filter((assignment) => !deletedTaskIdSet.has(assignment.id))
            .map((assignment) => ({
                id: assignment.id,
                name: assignment.name,
                course: assignment.course.displayName ?? assignment.course.name,
                dueAt: assignment.dueAt?.toISOString() ?? null,
                htmlUrl: assignment.htmlUrl ?? null,
            }));

        return NextResponse.json({
            success: true,
            pending,
            maybe,
            addedFromCanvas,
        });
    } catch (error) {
        console.error("❌ Failed to load rundown candidates:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
