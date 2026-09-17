"use client";

import { useState } from "react";
import { useWindowManager } from "@/components/os/WindowManagerContext";
import Mascot from "./Mascot";
import PixelBlock from "./PixelBlock";
import HourglassPanel from "./HourglassPanel";
import BardPanel from "./BardPanel";

type Props = {
    onOpenLaptop: () => void;
    dialogue?: string | null;
};

// Fixed screen UI, not an in-world map object — previously Nano/the
// Hourglass/the Bard/the laptop button were WorldLayoutData.markers,
// positioned on the map and panned/zoomed with it; now they're a
// permanent dock on the right edge, like the Fit/Tools/Guides controls
// already are. No stopPropagation-from-MapViewport concerns here (unlike
// when these lived inside TownMap) since this renders as a sibling of
// MapViewport, never inside its transformed/pannable tree.
export default function WorldToolbar({ onOpenLaptop, dialogue }: Props) {
    const { openWindow } = useWindowManager();
    const [openPanel, setOpenPanel] = useState<"hourglass" | "bard" | null>(null);

    const openHourglass = () => {
        openWindow("pomodoro");
        setOpenPanel("hourglass");
    };

    const openBard = () => {
        openWindow("music");
        setOpenPanel("bard");
    };

    return (
        <>
            <div
                className="fixed right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-4 rounded-2xl border p-3 shadow-lg"
                style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
                <Mascot dialogue={dialogue} size="md" />

                {/* The hourglass and the bard: reskinned equivalents of the
                    OS Pomodoro/Music windows ("Ancient time magic"/"Bard's
                    enchanted lute") — same live state and controls, just
                    Kingdom-themed, so the laptop never has to open just for
                    these two. */}
                <button
                    type="button"
                    onClick={openHourglass}
                    className="flex flex-col items-center gap-1 transition-transform hover:scale-105"
                >
                    <PixelBlock size="md" emoji="⏳" tone="accent" />
                    <span className="text-[10px] font-bold" style={{ color: "var(--heading)" }}>
                        Hourglass
                    </span>
                </button>

                <button
                    type="button"
                    onClick={openBard}
                    className="flex flex-col items-center gap-1 transition-transform hover:scale-105"
                >
                    <PixelBlock size="md" emoji="🎻" tone="accent" />
                    <span className="text-[10px] font-bold" style={{ color: "var(--heading)" }}>
                        Bard
                    </span>
                </button>

                <button
                    type="button"
                    onClick={onOpenLaptop}
                    className="flex flex-col items-center gap-1 transition-transform hover:scale-105"
                >
                    <PixelBlock size="md" emoji="💻" tone="accent" />
                    <span className="text-[10px] font-bold" style={{ color: "var(--heading)" }}>
                        Laptop
                    </span>
                </button>
            </div>

            {openPanel && (
                <div className="fixed right-24 top-1/2 z-30 -translate-y-1/2">
                    {openPanel === "hourglass" ? (
                        <HourglassPanel onClose={() => setOpenPanel(null)} />
                    ) : (
                        <BardPanel onClose={() => setOpenPanel(null)} />
                    )}
                </div>
            )}
        </>
    );
}
