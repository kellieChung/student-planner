import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORLD_LAYOUT, isValidWorldLayoutData } from "@/lib/worldLayout";
import { WorldLayoutData } from "@/types/worldLayout";
import { TownState } from "@/types/townState";
import MapEditor from "@/components/dev/MapEditor";

// Unlinked dev/test route (same precedent as /dev/gamification,
// /dev/sprite-check) — lets the World map be visually redesigned against
// the real account without hand-editing spriteMap.ts/TownMap.tsx per
// change. Never referenced from the main UI.
export default async function MapEditorPage() {
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

    const [worldLayoutRow, townStateRow] = await Promise.all([
        prisma.worldLayout.findUnique({ where: { userId: user.id } }),
        prisma.townState.findUnique({ where: { userId: user.id } }),
    ]);

    const initialLayout: WorldLayoutData = isValidWorldLayoutData(worldLayoutRow?.data)
        ? worldLayoutRow.data
        : DEFAULT_WORLD_LAYOUT;

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
        <main className="h-screen w-screen overflow-hidden" style={{ background: "var(--app-background)" }}>
            <MapEditor initialLayout={initialLayout} initialTownState={initialTownState} />
        </main>
    );
}
