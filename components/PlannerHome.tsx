import { getAllAssignments } from "@/lib/canvas";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";
import { prisma } from "@/lib/prisma";
import { isDevAccountEmail } from "@/lib/devAccounts";
import LaptopFrame, { type TourMode } from "@/components/world/LaptopFrame";
import { StarChartState } from "@/lib/starChart";

type Props = {
    user: { id: string; name: string | null; email: string | null };
    tourMode?: TourMode;
};

// The signed-in planner (Ship's Log + Star Chart), shared by "/" and the
// /dev/onboarding tour replay page so both render exactly the same app.
export default async function PlannerHome({ user, tourMode = "normal" }: Props) {
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

    // Never auto-open the Rundown on top of the onboarding tour.
    const tourWillShow = tourMode === "preview" || starChart.onboardedAt === null;

    const initialRundown = {
        shouldAutoShow: !tourWillShow && (pendingCandidateCount > 0 || newCanvasAssignmentCount > 0),
        maybeCount: maybeCandidateCount,
        autoAcceptAiTasks: plannerSettingsRow?.autoAcceptAiTasks ?? false,
        completionSound: plannerSettingsRow?.completionSound ?? true,
    };

    return (
        <main className="h-dvh w-full overflow-hidden">
            <LaptopFrame starChart={starChart} tourMode={tourMode}>
                <div className="app-header mx-auto flex min-h-full w-full flex-col px-4">
                    <WeeklyPlannerView
                        assignments={assignments}
                        userName={user.name}
                        userEmail={user.email}
                        isDev={isDevAccountEmail(user.email)}
                        initialRundown={initialRundown}
                    />
                </div>
            </LaptopFrame>
        </main>
    );
}
