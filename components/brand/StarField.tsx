type Props = {
    count: number;
    seed: number;
    className?: string;
};

// Seeded so server and client render identical star positions.
function mulberry32(seed: number) {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export default function StarField({ count, seed, className = "" }: Props) {
    const random = mulberry32(seed);
    const stars = Array.from({ length: count }, (_, index) => {
        const lit = random() < 0.14;
        return {
            id: index,
            x: random() * 100,
            y: random() * 100,
            r: lit ? 1.1 + random() * 0.8 : 0.4 + random() * 0.7,
            lit,
            twinkle: random() < 0.35,
            delay: (random() * 6).toFixed(2),
            duration: (4 + random() * 5).toFixed(2),
        };
    });

    return (
        <svg
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
            preserveAspectRatio="none"
        >
            {stars.map((star) => (
                <circle
                    key={star.id}
                    cx={`${star.x}%`}
                    cy={`${star.y}%`}
                    r={star.r}
                    className={`${star.lit ? "ls-star-lit" : "ls-star-dim"} ${star.twinkle ? "ls-twinkle" : ""}`}
                    style={{ animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` }}
                />
            ))}
        </svg>
    );
}
