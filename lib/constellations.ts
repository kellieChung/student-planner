export type ChartStar = {
    x: number;
    y: number;
    // 1 = brightest; drives rendered size only.
    mag: 1 | 2 | 3;
    name?: string;
};

export type Constellation = {
    id: string;
    name: string;
    commonName?: string;
    stars: ChartStar[];
    edges: [number, number][];
    // Lifetime Starlight needed before this constellation appears.
    unlockAt: number;
};

export type ChartedStarRef = {
    constellationId: string;
    starIndex: number;
};

// Real IAU constellations, deliberately not tied to the user's classes
// (gamificationSystem.md). Ordered by unlock: instantly recognisable ones
// first, more obscure ones surfacing as lifetime Starlight grows. Coordinates
// are a 0–100 box per constellation — recognisable approximations of each
// asterism, not astrometric data. The first 15 of 88 ship now.
export const CONSTELLATIONS: Constellation[] = [
    {
        id: "orion",
        name: "Orion",
        commonName: "The Hunter",
        unlockAt: 0,
        stars: [
            { x: 28, y: 22, mag: 1, name: "Betelgeuse" },
            { x: 68, y: 26, mag: 2, name: "Bellatrix" },
            { x: 48, y: 10, mag: 3, name: "Meissa" },
            { x: 42, y: 52, mag: 2, name: "Alnitak" },
            { x: 50, y: 50, mag: 2, name: "Alnilam" },
            { x: 58, y: 48, mag: 2, name: "Mintaka" },
            { x: 34, y: 84, mag: 2, name: "Saiph" },
            { x: 72, y: 80, mag: 1, name: "Rigel" },
        ],
        edges: [[2, 0], [2, 1], [0, 3], [1, 5], [3, 4], [4, 5], [3, 6], [5, 7]],
    },
    {
        id: "ursa-major",
        name: "Ursa Major",
        commonName: "The Big Dipper",
        unlockAt: 0,
        stars: [
            { x: 78, y: 30, mag: 1, name: "Dubhe" },
            { x: 80, y: 52, mag: 2, name: "Merak" },
            { x: 58, y: 58, mag: 2, name: "Phecda" },
            { x: 56, y: 38, mag: 3, name: "Megrez" },
            { x: 38, y: 34, mag: 1, name: "Alioth" },
            { x: 22, y: 30, mag: 2, name: "Mizar" },
            { x: 6, y: 40, mag: 2, name: "Alkaid" },
        ],
        edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
    },
    {
        id: "cassiopeia",
        name: "Cassiopeia",
        commonName: "The Queen",
        unlockAt: 0,
        stars: [
            { x: 8, y: 34, mag: 2, name: "Caph" },
            { x: 28, y: 62, mag: 1, name: "Schedar" },
            { x: 48, y: 44, mag: 1, name: "Navi" },
            { x: 68, y: 66, mag: 2, name: "Ruchbah" },
            { x: 90, y: 40, mag: 3, name: "Segin" },
        ],
        edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
    },
    {
        id: "ursa-minor",
        name: "Ursa Minor",
        commonName: "The Little Dipper",
        unlockAt: 150,
        stars: [
            { x: 12, y: 20, mag: 1, name: "Polaris" },
            { x: 28, y: 30, mag: 3, name: "Yildun" },
            { x: 42, y: 42, mag: 3 },
            { x: 56, y: 54, mag: 3 },
            { x: 84, y: 58, mag: 1, name: "Kochab" },
            { x: 78, y: 80, mag: 2, name: "Pherkad" },
            { x: 54, y: 76, mag: 3 },
        ],
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
    },
    {
        id: "cygnus",
        name: "Cygnus",
        commonName: "The Swan",
        unlockAt: 350,
        stars: [
            { x: 50, y: 10, mag: 1, name: "Deneb" },
            { x: 50, y: 40, mag: 2, name: "Sadr" },
            { x: 20, y: 34, mag: 2, name: "Gienah" },
            { x: 80, y: 30, mag: 2 },
            { x: 50, y: 62, mag: 3 },
            { x: 50, y: 90, mag: 2, name: "Albireo" },
        ],
        edges: [[0, 1], [1, 4], [4, 5], [2, 1], [1, 3]],
    },
    {
        id: "lyra",
        name: "Lyra",
        commonName: "The Lyre",
        unlockAt: 600,
        stars: [
            { x: 30, y: 14, mag: 1, name: "Vega" },
            { x: 16, y: 28, mag: 3 },
            { x: 44, y: 38, mag: 3 },
            { x: 60, y: 70, mag: 3 },
            { x: 38, y: 80, mag: 2, name: "Sulafat" },
            { x: 22, y: 66, mag: 2, name: "Sheliak" },
        ],
        edges: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 2]],
    },
    {
        id: "scorpius",
        name: "Scorpius",
        commonName: "The Scorpion",
        unlockAt: 900,
        stars: [
            { x: 18, y: 10, mag: 2, name: "Acrab" },
            { x: 22, y: 24, mag: 2, name: "Dschubba" },
            { x: 10, y: 30, mag: 3 },
            { x: 36, y: 32, mag: 1, name: "Antares" },
            { x: 44, y: 42, mag: 3 },
            { x: 50, y: 56, mag: 2 },
            { x: 52, y: 70, mag: 3 },
            { x: 60, y: 84, mag: 3 },
            { x: 76, y: 90, mag: 2, name: "Sargas" },
            { x: 88, y: 78, mag: 3 },
            { x: 84, y: 64, mag: 1, name: "Shaula" },
        ],
        edges: [[0, 1], [2, 1], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]],
    },
    {
        id: "leo",
        name: "Leo",
        commonName: "The Lion",
        unlockAt: 1250,
        stars: [
            { x: 70, y: 74, mag: 1, name: "Regulus" },
            { x: 66, y: 56, mag: 3 },
            { x: 62, y: 40, mag: 2, name: "Algieba" },
            { x: 66, y: 26, mag: 3, name: "Adhafera" },
            { x: 76, y: 16, mag: 3, name: "Rasalas" },
            { x: 86, y: 22, mag: 3 },
            { x: 34, y: 44, mag: 2, name: "Zosma" },
            { x: 10, y: 56, mag: 1, name: "Denebola" },
            { x: 32, y: 62, mag: 3, name: "Chertan" },
        ],
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8], [8, 0], [6, 8]],
    },
    {
        id: "gemini",
        name: "Gemini",
        commonName: "The Twins",
        unlockAt: 1650,
        stars: [
            { x: 20, y: 12, mag: 1, name: "Castor" },
            { x: 44, y: 10, mag: 1, name: "Pollux" },
            { x: 22, y: 34, mag: 3 },
            { x: 24, y: 56, mag: 3, name: "Mebsuta" },
            { x: 22, y: 82, mag: 3, name: "Tejat" },
            { x: 46, y: 46, mag: 3, name: "Wasat" },
            { x: 48, y: 64, mag: 3, name: "Mekbuda" },
            { x: 52, y: 88, mag: 2, name: "Alhena" },
        ],
        edges: [[0, 1], [0, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7]],
    },
    {
        id: "taurus",
        name: "Taurus",
        commonName: "The Bull",
        unlockAt: 2100,
        stars: [
            { x: 40, y: 56, mag: 1, name: "Aldebaran" },
            { x: 58, y: 58, mag: 3 },
            { x: 54, y: 44, mag: 3 },
            { x: 40, y: 38, mag: 3 },
            { x: 8, y: 26, mag: 3, name: "Tianguan" },
            { x: 24, y: 6, mag: 2, name: "Elnath" },
            { x: 76, y: 72, mag: 3 },
            { x: 90, y: 40, mag: 2, name: "Pleiades" },
        ],
        edges: [[1, 0], [1, 2], [2, 3], [0, 4], [3, 5], [1, 6], [6, 7]],
    },
    {
        id: "pegasus",
        name: "Pegasus",
        commonName: "The Winged Horse",
        unlockAt: 2600,
        stars: [
            { x: 60, y: 60, mag: 2, name: "Markab" },
            { x: 60, y: 30, mag: 2, name: "Scheat" },
            { x: 88, y: 26, mag: 1, name: "Alpheratz" },
            { x: 90, y: 60, mag: 2, name: "Algenib" },
            { x: 40, y: 66, mag: 3, name: "Homam" },
            { x: 10, y: 80, mag: 2, name: "Enif" },
            { x: 40, y: 24, mag: 3, name: "Matar" },
        ],
        edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 5], [1, 6]],
    },
    {
        id: "andromeda",
        name: "Andromeda",
        commonName: "The Princess",
        unlockAt: 3150,
        stars: [
            { x: 12, y: 62, mag: 1, name: "Alpheratz" },
            { x: 30, y: 54, mag: 3 },
            { x: 48, y: 48, mag: 1, name: "Mirach" },
            { x: 84, y: 34, mag: 2, name: "Almach" },
            { x: 44, y: 30, mag: 3 },
            { x: 40, y: 16, mag: 3 },
            { x: 28, y: 40, mag: 3 },
        ],
        edges: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [1, 6]],
    },
    {
        id: "aquila",
        name: "Aquila",
        commonName: "The Eagle",
        unlockAt: 3750,
        stars: [
            { x: 50, y: 40, mag: 1, name: "Altair" },
            { x: 44, y: 30, mag: 2, name: "Tarazed" },
            { x: 56, y: 52, mag: 3, name: "Alshain" },
            { x: 44, y: 62, mag: 3 },
            { x: 30, y: 82, mag: 3 },
            { x: 26, y: 20, mag: 3 },
            { x: 80, y: 70, mag: 3 },
        ],
        edges: [[1, 0], [0, 2], [0, 3], [3, 4], [1, 5], [3, 6]],
    },
    {
        id: "draco",
        name: "Draco",
        commonName: "The Dragon",
        unlockAt: 4400,
        stars: [
            { x: 92, y: 18, mag: 3, name: "Giausar" },
            { x: 82, y: 30, mag: 3 },
            { x: 70, y: 38, mag: 3, name: "Thuban" },
            { x: 60, y: 50, mag: 3, name: "Edasich" },
            { x: 50, y: 60, mag: 3 },
            { x: 38, y: 56, mag: 3 },
            { x: 28, y: 64, mag: 3 },
            { x: 20, y: 50, mag: 3, name: "Altais" },
            { x: 14, y: 36, mag: 3, name: "Grumium" },
            { x: 6, y: 20, mag: 1, name: "Eltanin" },
            { x: 16, y: 12, mag: 2, name: "Rastaban" },
            { x: 24, y: 24, mag: 3 },
        ],
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 8]],
    },
    {
        id: "crux",
        name: "Crux",
        commonName: "The Southern Cross",
        unlockAt: 5100,
        stars: [
            { x: 48, y: 88, mag: 1, name: "Acrux" },
            { x: 50, y: 12, mag: 1, name: "Gacrux" },
            { x: 18, y: 48, mag: 1, name: "Mimosa" },
            { x: 80, y: 42, mag: 2, name: "Imai" },
            { x: 66, y: 64, mag: 3, name: "Ginan" },
        ],
        edges: [[0, 1], [2, 3]],
    },
];

const BASE_STAR_PRICE = 25;
const PRICE_STEP = 5;

export function getConstellation(id: string): Constellation | undefined {
    return CONSTELLATIONS.find((constellation) => constellation.id === id);
}

// Later constellations cost a little more per star, so the sky keeps pace
// with a growing Starlight balance without any one star feeling out of reach.
export function starPrice(constellation: Constellation): number {
    return BASE_STAR_PRICE + PRICE_STEP * CONSTELLATIONS.indexOf(constellation);
}

export function isUnlocked(constellation: Constellation, lifetimeStarlight: number): boolean {
    return lifetimeStarlight >= constellation.unlockAt;
}

export function nextUnlock(lifetimeStarlight: number): Constellation | null {
    return CONSTELLATIONS.find((constellation) => constellation.unlockAt > lifetimeStarlight) ?? null;
}

export function chartedIndexes(constellationId: string, charted: ChartedStarRef[]): Set<number> {
    return new Set(charted.filter((star) => star.constellationId === constellationId).map((star) => star.starIndex));
}

export function isComplete(constellation: Constellation, charted: ChartedStarRef[]): boolean {
    return chartedIndexes(constellation.id, charted).size >= constellation.stars.length;
}
