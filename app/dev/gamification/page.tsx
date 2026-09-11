import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import GamificationDevPanel from "@/components/dev/GamificationDevPanel";
import { GamificationState } from "@/types/gamification";
import { TownState } from "@/types/townState";

// Unlinked dev/test route (same precedent as app/login, app/extension-*) —
// lets the gamification layer be reset and exercised repeatedly against the
// real account without hand-editing state via devtools each time. Never
// referenced from the main UI.
export default async function GamificationDevPage() {
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

    const gamificationRow = await prisma.gamificationState.findUnique({
        where: { userId: user.id },
    });

    const townStateRow = await prisma.townState.findUnique({
        where: { userId: user.id },
    });

    const initialGamification: GamificationState = {
        totalXp: gamificationRow?.totalXp ?? 0,
        awardedTaskIds: gamificationRow?.awardedTaskIds ?? [],
    };

    const initialTownState: TownState = {
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
        <main className="min-h-screen p-8">
            <div className="mx-auto max-w-4xl">
                <GamificationDevPanel
                    initialGamification={initialGamification}
                    initialTownState={initialTownState}
                />
            </div>
        </main>
    );
}
