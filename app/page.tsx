import { getAllAssignments } from "@/lib/canvas";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";
import {auth} from "@/auth"
import {redirect} from "next/navigation";
import {prisma} from "@/lib/prisma";
import LaptopFrame from "@/components/world/LaptopFrame";
import { StarChartState } from "@/lib/starChart";
import { hasAcceptedCurrentTerms } from "@/lib/legal";
import LandingPage from "@/components/landing/LandingPage";


export default async function TestPage() {
    const session = await auth();

    if (!session?.user?.email) {
        return <LandingPage />;
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    // A JWT can outlive a deleted account; treat that visitor as logged out.
    if (!user) {
        return <LandingPage />;
    }

    if (!hasAcceptedCurrentTerms(user)) {
        redirect("/accept-terms");
    }

    const assignments: Assignment[] = (await getAllAssignments(user.id)).map((assignment) => ({
        ...assignment,
        due: assignment.due ?? "",
    }));

    const [starChartRow, chartedStars] = await Promise.all([
        prisma.starChart.findUnique({ where: { userId: user.id } }),
        prisma.chartedStar.findMany({
            where: { userId: user.id },
            select: { constellationId: true, starIndex: true },
            orderBy: { chartedAt: "asc" },
        }),
    ]);

    const starChart: StarChartState = {
        starlight: starChartRow?.starlight ?? 0,
        lifetimeStarlight: starChartRow?.lifetimeStarlight ?? 0,
        onboardedAt: starChartRow?.onboardedAt?.toISOString() ?? null,
        charted: chartedStars,
    };

    // AutoTaskCreation.md's Rundown screen: "is there anything new since
    // last visit" computed once here (three indexed point-lookups, no
    // extra round trip before first paint) — the full candidate/item
    // payloads are fetched lazily by WeeklyPlannerView's own mount effect
    // (GET /api/rundown-candidates), same as every other piece of planner
    // state in this app.
    const plannerSettingsRow = await prisma.plannerSettings.findUnique({
        where: { userId: user.id },
    });

    const lastRundownViewedAt = plannerSettingsRow?.lastRundownViewedAt ?? null;

    const [pendingCandidateCount, maybeCandidateCount, newCanvasAssignmentCount] = await Promise.all([
        prisma.announcementSuggestionReview.count({
            where: { userId: user.id, status: "pending" },
        }),
        prisma.announcementSuggestionReview.count({
            where: { userId: user.id, status: "maybe" },
        }),
        prisma.assignment.count({
            where: { userId: user.id, createdAt: { gt: lastRundownViewedAt ?? new Date(0) } },
        }),
    ]);

    const initialRundown = {
        shouldAutoShow: pendingCandidateCount > 0 || newCanvasAssignmentCount > 0,
        maybeCount: maybeCandidateCount,
        autoAcceptAiTasks: plannerSettingsRow?.autoAcceptAiTasks ?? false,
    };

    return (
        <main className="h-screen w-screen overflow-hidden p-3 sm:p-4">
            <LaptopFrame starChart={starChart}>
                <div className="app-header w-full px-4 mx-auto">
                    <WeeklyPlannerView
                        assignments={assignments}
                        userName={user.name}
                        userEmail={user.email}
                        initialRundown={initialRundown}
                    />
                </div>
            </LaptopFrame>
        </main>
    );
}
