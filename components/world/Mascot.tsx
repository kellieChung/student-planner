"use client";

import PixelBlock from "./PixelBlock";
import { MASCOT_NAME } from "@/lib/mascotDialogue";

type Props = {
    dialogue?: string | null;
    size?: "md" | "lg";
};

export default function Mascot({ dialogue, size = "lg" }: Props) {
    return (
        <div className="flex flex-col items-center gap-1">
            {dialogue && (
                <div
                    className="mb-1 max-w-[240px] rounded-lg border px-3 py-2 text-center text-xs shadow-md transition-opacity duration-200"
                    style={{ background: "var(--panel-raised)", borderColor: "var(--accent)", color: "var(--foreground)" }}
                    role="status"
                >
                    {dialogue}
                </div>
            )}
            <PixelBlock size={size} emoji="🧙‍♂️" tone="accent" />
            <span className="text-xs font-bold" style={{ color: "var(--heading)" }}>
                {MASCOT_NAME}
            </span>
        </div>
    );
}
