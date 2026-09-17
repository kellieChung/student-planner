"use client";

import { TownState, KingdomStage } from "@/types/townState";
import { WorldLayoutData } from "@/types/worldLayout";
import { nextKingdomStage, STAGE_THRESHOLDS, totalTownGrowth } from "@/lib/townGrowth";
import TownMap from "./TownMap";
import MapViewport from "./MapViewport";
import WorldToolbar from "./WorldToolbar";

type Props = {
    townState: TownState;
    layout: WorldLayoutData;
    onOpenLaptop: () => void;
    dialogue?: string | null;
};

const STAGE_LABEL: Record<KingdomStage, string> = {
    village: "Village",
    town: "Town",
    city: "City",
    kingdom: "Kingdom",
};

export default function WorldView({ townState, layout, onOpenLaptop, dialogue }: Props) {
    // The stage label/visual only advances at a milestone checkpoint
    // (maybeAdvanceKingdomStage, lib/townGrowth.ts) — it's read directly
    // from persisted state, not computed live from current growth, so the
    // big jump reads as earned rather than an automatic side effect of any
    // one task. The progress bar below stays live on purpose.
    const stage = townState.kingdomStage;
    const next = nextKingdomStage(stage);
    const total = totalTownGrowth(townState);
    const nextThreshold = next ? STAGE_THRESHOLDS[next] : null;
    const progressPercent = nextThreshold ? Math.min(100, Math.round((total / nextThreshold) * 100)) : 100;

    return (
        <div className="flex h-full w-full flex-col" style={{ background: "var(--app-background)" }}>
            <div
                className="shrink-0 border-b px-4 py-2 sm:px-6 sm:py-3"
                style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p
                            className="text-[10px] font-bold uppercase tracking-[0.2em]"
                            style={{ color: "var(--muted)" }}
                        >
                            Realm status
                        </p>
                        <h2 className="text-lg font-bold sm:text-xl" style={{ color: "var(--heading)" }}>
                            {STAGE_LABEL[stage]}
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold"
                            style={{ borderColor: "var(--border)", color: "var(--xp-bar)" }}
                        >
                            🪙 {townState.currency}
                        </div>
                    </div>
                </div>
                {next && (
                    <div className="mt-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--xp-track)" }}>
                            <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${progressPercent}%`, background: "var(--xp-bar)" }}
                            />
                        </div>
                        <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
                            {total}/{nextThreshold} toward {STAGE_LABEL[next]}
                        </p>
                    </div>
                )}
            </div>

            <div className="min-h-0 flex-1">
                <MapViewport>
                    <TownMap townState={townState} layout={layout} />
                </MapViewport>
            </div>

            <WorldToolbar onOpenLaptop={onOpenLaptop} dialogue={dialogue} />
        </div>
    );
}
