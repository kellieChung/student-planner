import { BASE_CONSTELLATIONS } from "@/lib/constellationCatalog";
import { PACK_CONSTELLATIONS } from "@/lib/constellationPacks";
import { CONSTELLATION_NOTES } from "@/lib/constellationNotes";

export type ChartStar = {
    x: number;
    y: number;
    // 1 = brightest; drives rendered size and price.
    mag: 1 | 2 | 3;
    name?: string;
};

export type SkyRegionId =
    | "home"
    | "southern"
    | "zodiac"
    | "heroes"
    | "river"
    | "deep-south"
    | "small-wonders"
    | "instruments";

export type SkyRegion = {
    id: SkyRegionId;
    name: string;
    description: string;
    // Starlight spent to open it; 0 = always open.
    price: number;
    // Lifetime Starlight before it can be bought.
    requiresLifetime: number;
    // Must already own at least one of these (choose-your-path tiers).
    requiresAnyOf?: SkyRegionId[];
    // "lifetime": each constellation appears at its own unlockAt.
    // "progress": three appear at purchase, then one more per constellation
    // in the region fully charted.
    reveal: "lifetime" | "progress";
    // Flat per-star base price; without it the catalog-index curve applies.
    starBase?: number;
    // One-time Starlight for fully charting every constellation in it.
    bounty: number;
};

// The star data as written in the catalog files; notes are merged in below.
export type ConstellationData = {
    id: string;
    region: SkyRegionId;
    name: string;
    commonName?: string;
    stars: ChartStar[];
    edges: [number, number][];
    // Lifetime Starlight needed before this constellation appears (once its
    // region is open). Unused in "progress" regions.
    unlockAt: number;
};

export type Constellation = ConstellationData & {
    ra: number;
    dec: number;
    span: number;
    fact: string;
};

export type ChartedStarRef = {
    constellationId: string;
    starIndex: number;
    // ISO timestamp; only for display (Galaxy view).
    chartedAt?: string;
};

// Order matters: ChartedStar rows and home-sky prices depend on it. New
// constellations are only ever appended (lib/constellationPacks.ts).
export const CONSTELLATIONS: Constellation[] = [...BASE_CONSTELLATIONS, ...PACK_CONSTELLATIONS].map((constellation) => {
    const note = CONSTELLATION_NOTES[constellation.id];
    if (!note) throw new Error(`Missing sky note for constellation "${constellation.id}"`);
    return { ...constellation, ...note };
});

export const SKY_REGIONS: SkyRegion[] = [
    {
        id: "home",
        name: "Your sky",
        description: "The constellations every navigator starts with.",
        price: 0,
        requiresLifetime: 0,
        reveal: "lifetime",
        bounty: 500,
    },
    {
        id: "southern",
        name: "The Southern Sky",
        description: "Twelve constellations below the horizon you started from, led by Sirius, the Teapot and Alpha Centauri.",
        price: 750,
        // Every home constellation has appeared by then.
        requiresLifetime: 6120,
        reveal: "lifetime",
        bounty: 400,
    },
    // Tier 1: after the Southern Sky, pick either (or both).
    {
        id: "zodiac",
        name: "The Zodiac",
        description: "The rest of the Sun's yearly path: Virgo, Aquarius, Aries and friends, plus Ophiuchus, the unofficial thirteenth sign.",
        price: 600,
        requiresLifetime: 13000,
        requiresAnyOf: ["southern"],
        reveal: "progress",
        starBase: 110,
        bounty: 400,
    },
    {
        id: "heroes",
        name: "Heroes & Legends",
        description: "Perseus, Hercules and the rest of the Greek myths that circle the northern sky.",
        price: 600,
        requiresLifetime: 13000,
        requiresAnyOf: ["southern"],
        reveal: "progress",
        starBase: 110,
        bounty: 400,
    },
    // Tier 2: needs one tier-1 pack.
    {
        id: "river",
        name: "The Long River",
        description: "Eridanus and Hydra wind across the winter sky, past Orion's hare, his little dog and the stern of the Argo.",
        price: 500,
        requiresLifetime: 18000,
        requiresAnyOf: ["zodiac", "heroes"],
        reveal: "progress",
        starBase: 90,
        bounty: 350,
    },
    {
        id: "deep-south",
        name: "The Deep South",
        description: "The menagerie Dutch navigators found near the south pole: a flying fish, a toucan's neighbours, a fly and a chameleon.",
        price: 500,
        requiresLifetime: 18000,
        requiresAnyOf: ["zodiac", "heroes"],
        reveal: "progress",
        starBase: 80,
        bounty: 300,
    },
    // Tier 3: needs one tier-2 pack.
    {
        id: "small-wonders",
        name: "Small Wonders",
        description: "Tiny constellations with big stories: a dolphin, an arrow, a fox and a queen's hair.",
        price: 400,
        requiresLifetime: 24000,
        requiresAnyOf: ["river", "deep-south"],
        reveal: "progress",
        starBase: 70,
        bounty: 300,
    },
    {
        id: "instruments",
        name: "Instruments of Science",
        description: "Fourteen faint tools of the trade: a compass, a clock, a telescope and a microscope among them.",
        price: 400,
        requiresLifetime: 24000,
        requiresAnyOf: ["river", "deep-south"],
        reveal: "progress",
        starBase: 70,
        bounty: 300,
    },
];

// Constellations visible the moment a "progress" region is bought.
export const PROGRESS_INITIAL_REVEAL = 3;

const BASE_STAR_PRICE = 20;
const PRICE_STEP = 6;
// Bright named stars cost more than faint ones, so there's a real choice
// between charting the showpiece now or a few dim stars.
const MAGNITUDE_PRICE_FACTOR: Record<ChartStar["mag"], number> = { 1: 1.5, 2: 1, 3: 0.75 };

export function getConstellation(id: string): Constellation | undefined {
    return CONSTELLATIONS.find((constellation) => constellation.id === id);
}

export function getSkyRegion(id: string): SkyRegion | undefined {
    return SKY_REGIONS.find((region) => region.id === id);
}

export function regionConstellations(regionId: SkyRegionId): Constellation[] {
    return CONSTELLATIONS.filter((constellation) => constellation.region === regionId);
}

export function ownsRegion(regionId: SkyRegionId, unlockedRegions: string[]): boolean {
    return regionId === "home" || unlockedRegions.includes(regionId);
}

// Whether the prerequisite packs are owned (lifetime is checked separately).
export function meetsRegionPrerequisites(region: SkyRegion, unlockedRegions: string[]): boolean {
    return !region.requiresAnyOf || region.requiresAnyOf.some((id) => ownsRegion(id, unlockedRegions));
}

// Later home/southern constellations cost more per star, so the sky keeps
// pace with a growing Starlight balance. The curve levels off at the last
// home constellation so the expansion stays reachable. Packs with a
// starBase use a flat base instead, cheaper for the faint late packs.
const PRICE_CURVE_CAP = 14;

export function starPrice(constellation: Constellation, starIndex: number): number {
    const starBase = getSkyRegion(constellation.region)?.starBase;
    const base = starBase ?? BASE_STAR_PRICE + PRICE_STEP * Math.min(CONSTELLATIONS.indexOf(constellation), PRICE_CURVE_CAP);
    const factor = MAGNITUDE_PRICE_FACTOR[constellation.stars[starIndex]?.mag ?? 2];

    return Math.max(10, Math.round((base * factor) / 5) * 5);
}

// The cheapest star still to chart (null when complete), for "from N" labels.
export function cheapestStarPrice(constellation: Constellation, charted: ChartedStarRef[]): number | null {
    const done = chartedIndexes(constellation.id, charted);
    const prices = constellation.stars
        .map((_, index) => index)
        .filter((index) => !done.has(index))
        .map((index) => starPrice(constellation, index));

    return prices.length > 0 ? Math.min(...prices) : null;
}

// How many of a "progress" region's constellations are revealed.
function progressRevealCount(regionId: SkyRegionId, charted: ChartedStarRef[]): number {
    const completed = regionConstellations(regionId).filter((constellation) => isComplete(constellation, charted)).length;
    return PROGRESS_INITIAL_REVEAL + completed;
}

// Its region is open and it has been revealed (lifetime Starlight for
// lifetime regions, completed neighbours for progress regions). `charted`
// must be all of the student's charted stars. A constellation the student
// already started stays visible even if a rebalance raised its threshold.
export function isVisible(
    constellation: Constellation,
    lifetimeStarlight: number,
    charted: ChartedStarRef[],
    unlockedRegions: string[]
): boolean {
    if (!ownsRegion(constellation.region, unlockedRegions)) return false;
    if (charted.some((star) => star.constellationId === constellation.id)) return true;

    const region = getSkyRegion(constellation.region);
    if (region?.reveal === "progress") {
        const position = regionConstellations(region.id).indexOf(constellation);
        return position < progressRevealCount(region.id, charted);
    }

    return lifetimeStarlight >= constellation.unlockAt;
}

// Next constellation to appear in a lifetime region (null for progress
// regions or when everything is out).
export function nextUnlock(regionId: SkyRegionId, lifetimeStarlight: number): Constellation | null {
    if (getSkyRegion(regionId)?.reveal === "progress") return null;

    return CONSTELLATIONS.find(
        (constellation) => constellation.region === regionId && constellation.unlockAt > lifetimeStarlight
    ) ?? null;
}

export function chartedIndexes(constellationId: string, charted: ChartedStarRef[]): Set<number> {
    return new Set(charted.filter((star) => star.constellationId === constellationId).map((star) => star.starIndex));
}

export function isComplete(constellation: Constellation, charted: ChartedStarRef[]): boolean {
    return chartedIndexes(constellation.id, charted).size >= constellation.stars.length;
}

export function isRegionComplete(regionId: SkyRegionId, charted: ChartedStarRef[]): boolean {
    return regionConstellations(regionId).every((constellation) => isComplete(constellation, charted));
}
