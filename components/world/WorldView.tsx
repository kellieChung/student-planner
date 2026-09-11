"use client";

import { TownState, KingdomStage, BuildingKey } from "@/types/townState";
import { computeKingdomStage, nextKingdomStage, STAGE_THRESHOLDS, totalTownGrowth } from "@/lib/townGrowth";
import Building from "./Building";
import Mascot from "./Mascot";

type Props = {
    townState: TownState;
    onOpenLaptop: () => void;
    dialogue?: string | null;
};

const STAGE_LABEL: Record<KingdomStage, string> = {
    village: "Village",
    town: "Town",
    city: "City",
    kingdom: "Kingdom",
};

const BUILDINGS: Array<{ key: BuildingKey; field: keyof TownState; label: string; emoji: string }> = [
    { key: "library", field: "libraryGrowth", label: "Library", emoji: "📚" },
    { key: "workshop", field: "workshopGrowth", label: "Workshop", emoji: "⚒️" },
    { key: "trainingGrounds", field: "trainingGroundsGrowth", label: "Training Grounds", emoji: "🏹" },
    { key: "watchtower", field: "watchtowerGrowth", label: "Watchtower", emoji: "🗼" },
    { key: "townSquare", field: "townSquareGrowth", label: "Town Square", emoji: "🏪" },
];

export default function WorldView({ townState, onOpenLaptop, dialogue }: Props) {
    const stage = computeKingdomStage(townState);
    const next = nextKingdomStage(stage);
    const total = totalTownGrowth(townState);
    const nextThreshold = next ? STAGE_THRESHOLDS[next] : null;
    const progressPercent = nextThreshold ? Math.min(100, Math.round((total / nextThreshold) * 100)) : 100;

    return (
        <div
            className="flex h-full min-h-[560px] w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6"
            style={{ background: "var(--app-background)" }}
        >
            <div
                className="rounded-xl border px-4 py-3"
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
                        <h2 className="text-xl font-bold" style={{ color: "var(--heading)" }}>
                            {STAGE_LABEL[stage]}
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {townState.currentStreak > 0 && (
                            <div
                                className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold"
                                style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                            >
                                🔥 {townState.currentStreak}
                            </div>
                        )}
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
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--xp-track)" }}>
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {BUILDINGS.map((building) => (
                    <Building
                        key={building.key}
                        buildingKey={building.key}
                        growth={townState[building.field] as number}
                        label={building.label}
                        emoji={building.emoji}
                    />
                ))}
            </div>

            <div className="flex flex-1 items-center justify-center py-4">
                <Mascot dialogue={dialogue} />
            </div>

            <div className="flex justify-center pb-2">
                <button
                    type="button"
                    onClick={onOpenLaptop}
                    className="rounded-lg border px-5 py-2 text-sm font-bold transition-transform hover:scale-105"
                    style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--heading)" }}
                >
                    💻 Open the Laptop
                </button>
            </div>
        </div>
    );
}
