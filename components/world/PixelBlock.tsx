"use client";

import type { CSSProperties, ReactNode } from "react";

type PixelBlockSize = "sm" | "md" | "lg" | "xl";
type PixelBlockTone = "muted" | "accent" | "warm";

type Props = {
    size?: PixelBlockSize;
    emoji?: string;
    label?: string;
    tone?: PixelBlockTone;
    faded?: boolean;
    children?: ReactNode;
    className?: string;
};

// The one placeholder-art primitive: a colored block standing in for real
// pixel art (gamificationSystem.md's own recommended placeholder strategy)
// until real assets exist. Every building/mascot/laptop visual reuses this
// instead of hand-rolling its own markup.
const SIZE_PX: Record<PixelBlockSize, number> = { sm: 28, md: 44, lg: 64, xl: 96 };
const EMOJI_SIZE: Record<PixelBlockSize, string> = { sm: "1rem", md: "1.5rem", lg: "2.25rem", xl: "3.25rem" };

export default function PixelBlock({
    size = "md",
    emoji,
    label,
    tone = "muted",
    faded = false,
    children,
    className = "",
}: Props) {
    const dimension = SIZE_PX[size];
    const background = tone === "accent" ? "var(--accent-soft)" : tone === "warm" ? "var(--xp-track)" : "var(--panel-muted)";
    const borderColor = tone === "accent" ? "var(--accent)" : "var(--border)";

    const style: CSSProperties = {
        width: dimension,
        height: dimension,
        background,
        border: `2px solid ${borderColor}`,
        borderRadius: 6,
        opacity: faded ? 0.45 : 1,
    };

    return (
        <div className={`flex shrink-0 flex-col items-center justify-center shadow-sm ${className}`} style={style}>
            {emoji && (
                <span style={{ fontSize: EMOJI_SIZE[size], lineHeight: 1 }} aria-hidden="true">
                    {emoji}
                </span>
            )}
            {children}
            {label && (
                <span
                    className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--muted)" }}
                >
                    {label}
                </span>
            )}
        </div>
    );
}
