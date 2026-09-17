"use client";

import { BuildingKey } from "@/types/townState";
import { TileRef } from "@/types/worldLayout";
import { computeBuildingStage } from "@/lib/townGrowth";
import TileRefSprite from "./TileRefSprite";

type Props = {
    buildingKey: BuildingKey;
    growth: number;
    label: string;
    top: number;
    left: number;
    stageSprites: [TileRef, TileRef, TileRef];
};

const STAGE_NAME = ["Empty Plot", "Basic Structure", "Upgraded"];
export const STAGE_SCALE = [3, 4, 3];

const LABEL_SHADOW = "0 1px 3px rgba(0,0,0,0.85)";

// A positioned sprite on TownMap's canvas, not a stat card — leveling up a
// building is a visible change here, a real sprite swap per
// `stageSprites` (user-configurable via /dev/map-editor, see
// lib/worldLayout.ts's WorldLayoutData.buildingStageSprites), not just a
// growth number.
export default function Building({ buildingKey, growth, label, top, left, stageSprites }: Props) {
    const stage = computeBuildingStage(growth);

    return (
        <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ top, left }}
            data-building={buildingKey}
        >
            <TileRefSprite tile={stageSprites[stage]} scale={STAGE_SCALE[stage]} className={stage === 0 ? "opacity-60" : ""} />

            <span className="text-[11px] font-bold" style={{ color: "var(--heading)", textShadow: LABEL_SHADOW }}>
                {label}
            </span>
            <span className="text-[9px] font-semibold" style={{ color: "var(--foreground)", textShadow: LABEL_SHADOW }}>
                {STAGE_NAME[stage]}
            </span>
        </div>
    );
}
