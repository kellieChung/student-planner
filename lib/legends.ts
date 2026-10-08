import {
    ChartedStarRef,
    getConstellation,
    isComplete,
    isRegionComplete,
    SKY_REGIONS,
    SkyRegionId,
} from "@/lib/constellations";

// Legends are one-time Starlight bounties for charting a set that spans
// constellations: a famous asterism (specific stars) or a myth (whole
// constellations). Regions pay their own bounty when fully lit. Claimed ids
// live in StarChart.claimedRewards ("legend:<id>" / "region:<id>").
export type Legend = {
    id: string;
    name: string;
    description: string;
    bounty: number;
    constellations?: string[];
    stars?: { constellationId: string; starName: string }[];
};

export type Reward = {
    id: string;
    kind: "legend" | "region";
    name: string;
    bounty: number;
};

export const LEGENDS: Legend[] = [
    {
        id: "two-bears",
        name: "The Two Bears",
        description: "Chart all of the Big and Little Dippers.",
        bounty: 100,
        constellations: ["ursa-major", "ursa-minor"],
    },
    {
        id: "summer-triangle",
        name: "Summer Triangle",
        description: "Chart Vega, Deneb and Altair.",
        bounty: 150,
        stars: [
            { constellationId: "lyra", starName: "Vega" },
            { constellationId: "cygnus", starName: "Deneb" },
            { constellationId: "aquila", starName: "Altair" },
        ],
    },
    {
        id: "southern-pointers",
        name: "Southern Pointers",
        description: "Chart all of Crux and Centaurus, whose brightest stars point the way to the south pole.",
        bounty: 200,
        constellations: ["crux", "centaurus"],
    },
    {
        id: "spring-triangle",
        name: "Spring Triangle",
        description: "Chart Arcturus, Spica and Denebola.",
        bounty: 200,
        stars: [
            { constellationId: "bootes", starName: "Arcturus" },
            { constellationId: "virgo", starName: "Spica" },
            { constellationId: "leo", starName: "Denebola" },
        ],
    },
    {
        id: "circumpolar",
        name: "Never Setting",
        description: "Chart all five constellations that circle the north pole: both Dippers, Draco, Cassiopeia and Cepheus.",
        bounty: 300,
        constellations: ["ursa-major", "ursa-minor", "draco", "cassiopeia", "cepheus"],
    },
    {
        id: "winter-hexagon",
        name: "Winter Hexagon",
        description: "Chart Sirius, Procyon, Pollux, Capella, Aldebaran and Rigel.",
        bounty: 400,
        stars: [
            { constellationId: "canis-major", starName: "Sirius" },
            { constellationId: "canis-minor", starName: "Procyon" },
            { constellationId: "gemini", starName: "Pollux" },
            { constellationId: "auriga", starName: "Capella" },
            { constellationId: "taurus", starName: "Aldebaran" },
            { constellationId: "orion", starName: "Rigel" },
        ],
    },
    {
        id: "orions-hunt",
        name: "Orion's Hunt",
        description: "Chart all of Orion, his two dogs, the hare he chases and the bull he faces.",
        bounty: 400,
        constellations: ["orion", "canis-major", "canis-minor", "lepus", "taurus"],
    },
    {
        id: "argo-navis",
        name: "Argo Navis Reassembled",
        description: "Rebuild Jason's ship: chart all of Carina, Vela, Puppis and Pyxis.",
        bounty: 400,
        constellations: ["carina", "vela", "puppis", "pyxis"],
    },
    {
        id: "navigators-kit",
        name: "The Navigator's Kit",
        description: "Chart all of the octant, compass, clock, drafting compass, telescope and square.",
        bounty: 300,
        constellations: ["octans", "pyxis", "horologium", "circinus", "telescopium", "norma"],
    },
    {
        id: "perseus-myth",
        name: "The Perseus Myth",
        description: "Chart the whole story: Perseus, Andromeda, Cassiopeia, Cepheus, Cetus and Pegasus.",
        bounty: 500,
        constellations: ["perseus", "andromeda", "cassiopeia", "cepheus", "cetus", "pegasus"],
    },
    {
        id: "full-zodiac",
        name: "The Full Zodiac",
        description: "Chart all twelve signs of the zodiac, plus Ophiuchus.",
        bounty: 750,
        constellations: [
            "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra",
            "scorpius", "ophiuchus", "sagittarius", "capricornus", "aquarius", "pisces",
        ],
    },
];

type Part = { constellationId: string; starIndex: number | null };

// Each legend as a list of parts: a whole constellation (starIndex null) or
// one star. Resolved once so a typo in a star name fails loudly at startup.
const LEGEND_PARTS: Map<string, Part[]> = new Map(
    LEGENDS.map((legend) => {
        const parts: Part[] = [
            ...(legend.constellations ?? []).map((constellationId) => {
                if (!getConstellation(constellationId)) throw new Error(`Legend ${legend.id}: unknown constellation ${constellationId}`);
                return { constellationId, starIndex: null };
            }),
            ...(legend.stars ?? []).map(({ constellationId, starName }) => {
                const starIndex = getConstellation(constellationId)?.stars.findIndex((star) => star.name === starName) ?? -1;
                if (starIndex < 0) throw new Error(`Legend ${legend.id}: unknown star ${starName} in ${constellationId}`);
                return { constellationId, starIndex };
            }),
        ];
        return [legend.id, parts];
    })
);

export function legendParts(legend: Legend): Part[] {
    return LEGEND_PARTS.get(legend.id) ?? [];
}

function partDone(part: Part, charted: ChartedStarRef[]): boolean {
    if (part.starIndex !== null) {
        return charted.some((star) => star.constellationId === part.constellationId && star.starIndex === part.starIndex);
    }
    const constellation = getConstellation(part.constellationId);
    return constellation ? isComplete(constellation, charted) : false;
}

export function legendProgress(legend: Legend, charted: ChartedStarRef[]): { done: number; total: number } {
    const parts = legendParts(legend);
    return { done: parts.filter((part) => partDone(part, charted)).length, total: parts.length };
}

export const legendRewardId = (legendId: string) => `legend:${legendId}`;
export const regionRewardId = (regionId: SkyRegionId) => `region:${regionId}`;

function allRewards(): Reward[] {
    return [
        ...LEGENDS.map((legend) => ({ id: legendRewardId(legend.id), kind: "legend" as const, name: legend.name, bounty: legend.bounty })),
        ...SKY_REGIONS.map((region) => ({ id: regionRewardId(region.id), kind: "region" as const, name: region.name, bounty: region.bounty })),
    ];
}

// Every reward that is finished but not yet paid. Computed over all charted
// stars, so a set finished before Legends shipped is paid on the next claim.
export function claimableRewards(charted: ChartedStarRef[], claimed: string[]): Reward[] {
    const claimedSet = new Set(claimed);

    return allRewards().filter((reward) => {
        if (claimedSet.has(reward.id)) return false;
        if (reward.kind === "region") return isRegionComplete(reward.id.slice("region:".length) as SkyRegionId, charted);

        const legend = LEGENDS.find((item) => legendRewardId(item.id) === reward.id);
        if (!legend) return false;
        const { done, total } = legendProgress(legend, charted);
        return done === total;
    });
}
