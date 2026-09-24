import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDevAccountEmail } from "@/lib/devAccounts";
import { getDetectionQuota, resetWeeklyDetectionUsage } from "@/lib/aiRateLimit";

// Dev tool for re-testing the announcement analyzer on the caller's OWN
// account (never another user's — the DB is shared with production):
// forgets which announcements were analyzed and every accept/reject/maybe
// decision, so the next check runs the whole pipeline again on real data.
// Tasks already added to the planner are left alone.
export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        if (!isDevAccountEmail(session.user.email)) {
            return NextResponse.json(
                { success: false, error: "Not a dev account." },
                { status: 403 }
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

        const body = await request.json().catch(() => null);
        const clearWeeklyUsage = body?.clearWeeklyUsage === true;

        const [announcements, reviews] = await prisma.$transaction([
            prisma.announcement.updateMany({
                where: { userId: user.id },
                data: { aiAnalyzedHash: null },
            }),
            prisma.announcementSuggestionReview.deleteMany({
                where: { userId: user.id },
            }),
        ]);

        const clearedRuns = clearWeeklyUsage ? await resetWeeklyDetectionUsage(user.id) : 0;

        return NextResponse.json({
            success: true,
            announcementsReset: announcements.count,
            reviewsDeleted: reviews.count,
            weeklyRunsCleared: clearedRuns,
            quota: await getDetectionQuota(user.id),
        });
    } catch (error) {
        console.error("❌ Failed to reset analyzer state:", error);

        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
