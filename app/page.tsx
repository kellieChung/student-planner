import { getAllAssignments } from "@/lib/canvas";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";
import {auth} from "@/auth"
import {redirect} from "next/navigation";
import {prisma} from "@/lib/prisma";
import { getStartOfWeek } from "@/lib/utils";
import LaptopFrame from "@/components/world/LaptopFrame";
import { TownState } from "@/types/townState";


export default async function TestPage() {
    const session = await auth();

    if (!session?.user?.email) {
        redirect("/login");
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    if (!user) {
        redirect("/login");
    }

    const assignments: Assignment[] = (await getAllAssignments(user.id)).map((assignment) => ({
        ...assignment,
        due: assignment.due ?? "",
    }));

    const sunday = getStartOfWeek();

    const townStateRow = await prisma.townState.findUnique({
        where: { userId: user.id },
    });

    const townState: TownState = {
        currency: townStateRow?.currency ?? 0,
        libraryGrowth: townStateRow?.libraryGrowth ?? 0,
        workshopGrowth: townStateRow?.workshopGrowth ?? 0,
        trainingGroundsGrowth: townStateRow?.trainingGroundsGrowth ?? 0,
        watchtowerGrowth: townStateRow?.watchtowerGrowth ?? 0,
        townSquareGrowth: townStateRow?.townSquareGrowth ?? 0,
        currentStreak: townStateRow?.currentStreak ?? 0,
        longestStreak: townStateRow?.longestStreak ?? 0,
        graceTokens: townStateRow?.graceTokens ?? 2,
        lastGoodDay: townStateRow?.lastGoodDay ?? null,
        onboardingCompletedAt: townStateRow?.onboardingCompletedAt?.toISOString() ?? null,
    };

    return (
        <main className="h-screen w-screen overflow-hidden p-3 sm:p-4">
            <LaptopFrame
                initialView={townState.onboardingCompletedAt ? "os" : "onboarding"}
                townState={townState}
            >
                <div className="app-header w-full px-4 mx-auto">
                    <WeeklyPlannerView
                        assignments={assignments}
                        weekStartDate={sunday}
                        userName={session.user.name}
                        userEmail={session.user.email}
                    />
                </div>
            </LaptopFrame>
        </main>
    );
}
