import { Constellation } from "@/lib/constellations";

type Props = {
    constellation: Constellation;
    charted: Set<number>;
    // Indexes to play the one-off ignite animation on.
    igniting?: Set<number>;
    // Draw every line in sequence (the completion moment).
    celebrate?: boolean;
    className?: string;
};

const RADIUS_BY_MAG = { 1: 3.2, 2: 2.5, 3: 1.9 } as const;

// Pure rendering of one constellation in its 0–100 box. Lines only light
// once both of their stars are charted; uncharted stars are outlines.
export default function ConstellationFigure({ constellation, charted, igniting, celebrate = false, className = "" }: Props) {
    const { stars, edges } = constellation;

    return (
        <svg viewBox="-6 -6 112 112" aria-hidden="true" className={`overflow-visible ${className}`}>
            {edges.map(([from, to], index) => {
                const lit = charted.has(from) && charted.has(to);
                return (
                    <line
                        key={`${from}-${to}`}
                        x1={stars[from].x}
                        y1={stars[from].y}
                        x2={stars[to].x}
                        y2={stars[to].y}
                        className={`${lit ? "ls-edge-lit" : "ls-edge-dim"} ${celebrate ? "ls-draw" : ""}`}
                        style={celebrate ? { animationDelay: `${index * 0.18}s` } : undefined}
                    />
                );
            })}
            {stars.map((star, index) =>
                charted.has(index) ? (
                    <g key={index} className={igniting?.has(index) ? "ls-ignite" : ""} style={{ transformOrigin: `${star.x}px ${star.y}px` }}>
                        <circle cx={star.x} cy={star.y} r={RADIUS_BY_MAG[star.mag] * 2.6} className="ls-map-halo" />
                        <circle
                            cx={star.x}
                            cy={star.y}
                            r={RADIUS_BY_MAG[star.mag]}
                            className="ls-star-lit ls-twinkle"
                            style={{ animationDelay: `${(index * 0.7) % 5}s`, animationDuration: "6s" }}
                        />
                    </g>
                ) : (
                    <circle key={index} cx={star.x} cy={star.y} r={RADIUS_BY_MAG[star.mag] * 0.8} className="ls-map-unlit" />
                )
            )}
        </svg>
    );
}
