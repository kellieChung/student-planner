"use client";

import { BuildingKey } from "@/types/townState";
import { BUILDING_STAGE_THRESHOLDS, computeBuildingStage } from "@/lib/townGrowth";
import PixelBlock from "./PixelBlock";

type Props = {
    buildingKey: BuildingKey;
    growth: number;
    label: string;
    emoji: string;
};

const STAGE_SIZE: Array<"sm" | "md" | "lg"> = ["sm", "md", "lg"];
const STAGE_NAME = ["Empty Plot", "Basic Structure", "Upgraded"];
const STAGE_DECOR_COUNT = [0, 1, 3];

export default function Building({ buildingKey, growth, label, emoji }: Props) {
    const stage = computeBuildingStage(growth);
    const nextThreshold = BUILDING_STAGE_THRESHOLDS[stage + 1];

    return (
        <div
            className="flex flex-col items-center gap-1 rounded-lg border px-3 py-3"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            data-building={buildingKey}
        >
            <div className="flex min-h-[64px] items-end gap-1">
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
            <span className="text-xs font-bold" style={{ color: "var(--heading)" }}>
                {label}
            </span>
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                {STAGE_NAME[stage]}
            </span>
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                {nextThreshold !== undefined ? `${growth}/${nextThreshold} growth` : `${growth} growth (max)`}
            </span>
        </div>
    );
}
