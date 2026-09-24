import { prisma } from "@/lib/prisma";
import { requireDevUser } from "@/app/dev/requireDevUser";
import { DEFAULT_WORLD_LAYOUT, isValidWorldLayoutData } from "@/lib/worldLayout";
import { WorldLayoutData } from "@/types/worldLayout";
import { TownState } from "@/types/townState";
import MapEditor from "@/components/dev/MapEditor";

// Launched from the dev dashboard (/dev) — lets the World map be visually
// redesigned against the real account without hand-editing spriteMap.ts/
// TownMap.tsx per change. Needs the full viewport, so it isn't a tab.
export default async function MapEditorPage() {
    const user = await requireDevUser();

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
