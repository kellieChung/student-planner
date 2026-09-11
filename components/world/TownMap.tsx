"use client";

import type { CSSProperties } from "react";
import { BuildingKey, TownState } from "@/types/townState";
import Building from "./Building";
import Mascot from "./Mascot";
import PixelBlock from "./PixelBlock";

type Props = {
    townState: TownState;
    onOpenLaptop: () => void;
    dialogue?: string | null;
};

const BUILDING_LAYOUT: Array<{
    key: BuildingKey;
    field: keyof TownState;
    label: string;
    emoji: string;
    top: string;
    left: string;
}> = [
    { key: "townSquare", field: "townSquareGrowth", label: "Town Square", emoji: "🏪", top: "58%", left: "50%" },
    { key: "library", field: "libraryGrowth", label: "Library", emoji: "📚", top: "24%", left: "18%" },
    { key: "workshop", field: "workshopGrowth", label: "Workshop", emoji: "⚒️", top: "24%", left: "82%" },
    { key: "trainingGrounds", field: "trainingGroundsGrowth", label: "Training Grounds", emoji: "🏹", top: "84%", left: "18%" },
    { key: "watchtower", field: "watchtowerGrowth", label: "Watchtower", emoji: "🗼", top: "84%", left: "82%" },
];

const DECORATIONS: Array<{ top: string; left: string; emoji: string }> = [
    { top: "45%", left: "6%", emoji: "🌳" },
    { top: "45%", left: "94%", emoji: "🌳" },
    { top: "10%", left: "50%", emoji: "🌲" },
    { top: "24%", left: "50%", emoji: "🪵" },
    { top: "84%", left: "50%", emoji: "🪧" },
];

// Placeholder "clearing" ground: soft dirt/stone patches under each
// building position over a grass base, standing in for real terrain tiles
// until actual art exists — reads as a town layout rather than a floating
// list of sprites, without needing fragile connecting-line geometry that
// wouldn't hold up across the wide range of real container aspect ratios
// this map can now render at (the laptop screen no longer has a fixed
// aspect ratio, per the user's own request).
const GROUND_STYLE: CSSProperties = {
    backgroundImage: [
        "radial-gradient(circle at 50% 58%, rgba(168,133,92,0.4) 0%, rgba(168,133,92,0.4) 13%, transparent 24%)",
        "radial-gradient(circle at 18% 24%, rgba(168,133,92,0.3) 0%, rgba(168,133,92,0.3) 9%, transparent 18%)",
        "radial-gradient(circle at 82% 24%, rgba(168,133,92,0.3) 0%, rgba(168,133,92,0.3) 9%, transparent 18%)",
        "radial-gradient(circle at 18% 84%, rgba(168,133,92,0.3) 0%, rgba(168,133,92,0.3) 9%, transparent 18%)",
        "radial-gradient(circle at 82% 84%, rgba(168,133,92,0.3) 0%, rgba(168,133,92,0.3) 9%, transparent 18%)",
        "linear-gradient(180deg, #2d5a3d 0%, #1f4530 100%)",
    ].join(", "),
};

export default function TownMap({ townState, onOpenLaptop, dialogue }: Props) {
    return (
        <div className="relative h-full min-h-[320px] w-full overflow-hidden" style={GROUND_STYLE}>
            {DECORATIONS.map((decoration, index) => (
                <div
                    key={index}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ top: decoration.top, left: decoration.left }}
                    aria-hidden="true"
                >
                    <PixelBlock size="sm" emoji={decoration.emoji} tone="muted" />
                </div>
            ))}

            {BUILDING_LAYOUT.map((building) => (
                <Building
                    key={building.key}
                    buildingKey={building.key}
                    growth={townState[building.field] as number}
                    label={building.label}
                    emoji={building.emoji}
                    top={building.top}
                    left={building.left}
                />
            ))}

            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: "38%", left: "50%" }}>
                <Mascot dialogue={dialogue} />
            </div>

            <button
                type="button"
                onClick={onOpenLaptop}
                className="absolute flex -translate-x-1/2 flex-col items-center gap-1 transition-transform hover:scale-105"
                style={{ top: "93%", left: "50%" }}
            >
                <PixelBlock size="md" emoji="💻" tone="accent" />
                <span
                    className="text-[10px] font-bold"
                    style={{ color: "var(--heading)", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}
                >
                    Open the Laptop
                </span>
            </button>
        </div>
    );
}
