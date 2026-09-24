import { prisma } from "@/lib/prisma";
import { requireDevUser } from "@/app/dev/requireDevUser";
import DevDashboard, { DevTabId } from "@/components/dev/DevDashboard";
import { GamificationState } from "@/types/gamification";
import { TownState } from "@/types/townState";

export const metadata = {
    title: "Dev dashboard",
};

const TAB_IDS: DevTabId[] = ["credits", "analyzer", "onboarding", "gamification", "map"];

// The one entry point for dev tooling (gated by DEV_ACCOUNT_EMAILS, see
// lib/devAccounts.ts). The map editor and the onboarding-tour preview need
// the full viewport / the real planner, so they stay their own routes and
// are launched from here.
export default async function DevDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const user = await requireDevUser();
    const { tab } = await searchParams;

    const [gamificationRow, townStateRow] = await Promise.all([
        prisma.gamificationState.findUnique({ where: { userId: user.id } }),
        prisma.townState.findUnique({ where: { userId: user.id } }),
    ]);

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
        kingdomStage: (townStateRow?.kingdomStage as TownState["kingdomStage"]) ?? "village",
        onboardingCompletedAt: townStateRow?.onboardingCompletedAt?.toISOString() ?? null,
    };

    return (
        <main className="min-h-screen p-8">
            <div className="mx-auto max-w-5xl">
                <DevDashboard
                    initialTab={TAB_IDS.find((id) => id === tab) ?? "credits"}
                    currentEmail={user.email ?? ""}
                    initialGamification={initialGamification}
                    initialTownState={initialTownState}
                />
            </div>
        </main>
    );
}
