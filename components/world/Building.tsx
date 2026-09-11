"use client";

import { BuildingKey } from "@/types/townState";
import { computeBuildingStage } from "@/lib/townGrowth";
import PixelBlock from "./PixelBlock";

type Props = {
    buildingKey: BuildingKey;
    growth: number;
    label: string;
    emoji: string;
    top: string;
    left: string;
};

const STAGE_SIZE: Array<"sm" | "md" | "lg"> = ["sm", "md", "lg"];
const STAGE_NAME = ["Empty Plot", "Basic Structure", "Upgraded"];
const STAGE_DECOR_COUNT = [0, 1, 3];

const LABEL_SHADOW = "0 1px 3px rgba(0,0,0,0.85)";

// A positioned sprite on TownMap's canvas, not a stat card — leveling up a
// building is a visible change here (bigger block, a plaza base replacing
// bare dirt, a flag topper at the final stage), not just a growth number.
export default function Building({ buildingKey, growth, label, emoji, top, left }: Props) {
    const stage = computeBuildingStage(growth);

    return (
        <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ top, left }}
            data-building={buildingKey}
        >
            {stage === 2 && <PixelBlock size="sm" emoji="🚩" tone="accent" className="-mb-1" />}

            <div className="flex items-end gap-1">
                <PixelBlock
                    size={STAGE_SIZE[stage]}
                    emoji={stage === 0 ? undefined : emoji}
                    tone={stage === 2 ? "accent" : "muted"}
                    faded={stage === 0}
                />
                {Array.from({ length: STAGE_DECOR_COUNT[stage] }).map((_, index) => (
                    <PixelBlock key={index} size="sm" emoji="🌳" tone="muted" />
                ))}
            </div>

            {/* Ground beneath the sprite: bare dirt at stage 0, a small plaza
                base once anything's actually been built. */}
            <div
                className="rounded-full"
                style={{
                    width: stage === 0 ? 22 : 44,
                    height: 6,
                    background: stage === 0 ? "rgba(120,90,60,0.55)" : "var(--xp-bar)",
                    opacity: stage === 0 ? 0.6 : 0.85,
                }}
            />

            <span className="text-[11px] font-bold" style={{ color: "var(--heading)", textShadow: LABEL_SHADOW }}>
                {label}
            </span>
            <span className="text-[9px] font-semibold" style={{ color: "var(--foreground)", textShadow: LABEL_SHADOW }}>
                {STAGE_NAME[stage]}
            </span>
        </div>
    );
}
