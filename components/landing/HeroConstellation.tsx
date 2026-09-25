import { getConstellation } from "@/lib/constellations";
import { DRAW_END, DRAW_START } from "@/components/landing/heroTimeline";

// The Big Dipper walked as one continuous path: handle, then round the bowl
// and back across to Megrez. Each hop is an edge in the real catalog.
const PATH = [6, 5, 4, 3, 2, 1, 0, 3];
const RADIUS_BY_MAG = { 1: 2.6, 2: 2.1, 3: 1.6 } as const;
const STAR_RAMP = 0.04;

type Vars = Record<`--${string}`, string | number>;

export default function HeroConstellation() {
    const { stars } = getConstellation("ursa-major")!;
    const hops = PATH.length - 1;
    const hopLength = (DRAW_END - DRAW_START) / hops;
    const startOf = (hop: number) => DRAW_START + hop * hopLength;

    // Node k of the path is reached when hop k-1 finishes, which is when
    // hop k begins; only the first visit to a star lights it.
    const litAt = new Map<number, number>();
    PATH.slice(0, hops).forEach((star, hop) => {
        if (!litAt.has(star)) litAt.set(star, startOf(hop));
    });

    return (
        <svg viewBox="-6 18 100 52" aria-hidden="true" className="ls-hero-figure w-[min(88vw,640px)] overflow-visible">
            {PATH.slice(0, hops).map((from, hop) => {
                const a = stars[from];
                const b = stars[PATH[hop + 1]];
                const length = Math.hypot(b.x - a.x, b.y - a.y);

                return (
                    <line
                        key={hop}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        className="ls-hero-edge"
                        style={{ "--s": startOf(hop), "--seg": hopLength, "--len": length.toFixed(2) } as Vars}
                    />
                );
            })}
            {Array.from(litAt).map(([index, start]) => {
                const star = stars[index];
                const radius = RADIUS_BY_MAG[star.mag];

                return (
                    <g key={index}>
                        <circle cx={star.x} cy={star.y} r={radius * 0.8} className="ls-map-unlit" />
                        <g className="ls-hero-lit" style={{ "--s": start, "--ramp": STAR_RAMP } as Vars}>
                            <circle cx={star.x} cy={star.y} r={radius * 2.6} className="ls-map-halo" />
                            <circle
                                cx={star.x}
                                cy={star.y}
                                r={radius}
                                className="ls-star-lit ls-twinkle"
                                style={{ animationDelay: `${(index * 0.9) % 5}s`, animationDuration: "6s" }}
                            />
                        </g>
                    </g>
                );
            })}
        </svg>
    );
}
