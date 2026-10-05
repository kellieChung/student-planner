import { prisma } from "@/lib/prisma";
import { requireDevUser } from "@/app/dev/requireDevUser";
import DevDashboard, { DevTabId } from "@/components/dev/DevDashboard";
import { GamificationState } from "@/types/gamification";

export const metadata = {
    title: "Dev dashboard",
};

const TAB_IDS: DevTabId[] = ["credits", "analyzer", "onboarding", "gamification"];

// The one entry point for dev tooling (gated by DEV_ACCOUNT_EMAILS, see
// lib/devAccounts.ts). The onboarding-tour preview needs the real planner,
// so it stays its own route and is launched from here.
export default async function DevDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const user = await requireDevUser();
    const { tab } = await searchParams;

    const gamificationRow = await prisma.gamificationState.findUnique({ where: { userId: user.id } });

    const initialGamification: GamificationState = {
        totalXp: gamificationRow?.totalXp ?? 0,
        awardedTaskIds: gamificationRow?.awardedTaskIds ?? [],
    };

    return (
        <main className="min-h-screen p-8">
            <div className="mx-auto max-w-5xl">
                <DevDashboard
                    initialTab={TAB_IDS.find((id) => id === tab) ?? "credits"}
                    currentEmail={user.email ?? ""}
                    initialGamification={initialGamification}
                />
            </div>
        </main>
    );
}
