import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONSTELLATIONS, PROGRESS_INITIAL_REVEAL, SKY_REGIONS, regionConstellations, starPrice } from "./constellations";
import { LEGENDS, legendParts } from "./legends";

// Manual check: `npx tsx lib/constellations.test.ts`. Catalog integrity,
// the frozen first 27 entries, legend references, Galaxy neighbours and a
// pacing estimate for the whole sky.

function check(label: string, ok: boolean) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) process.exitCode = 1;
}

const IAU = [
    "Andromeda", "Antlia", "Apus", "Aquarius", "Aquila", "Ara", "Aries", "Auriga", "Boötes", "Caelum",
    "Camelopardalis", "Cancer", "Canes Venatici", "Canis Major", "Canis Minor", "Capricornus", "Carina",
    "Cassiopeia", "Centaurus", "Cepheus", "Cetus", "Chamaeleon", "Circinus", "Columba", "Coma Berenices",
    "Corona Australis", "Corona Borealis", "Corvus", "Crater", "Crux", "Cygnus", "Delphinus", "Dorado",
    "Draco", "Equuleus", "Eridanus", "Fornax", "Gemini", "Grus", "Hercules", "Horologium", "Hydra", "Hydrus",
    "Indus", "Lacerta", "Leo", "Leo Minor", "Lepus", "Libra", "Lupus", "Lynx", "Lyra", "Mensa",
    "Microscopium", "Monoceros", "Musca", "Norma", "Octans", "Ophiuchus", "Orion", "Pavo", "Pegasus",
    "Perseus", "Phoenix", "Pictor", "Pisces", "Piscis Austrinus", "Puppis", "Pyxis", "Reticulum",
    "Sagitta", "Sagittarius", "Scorpius", "Sculptor", "Scutum", "Serpens", "Sextans", "Taurus",
    "Telescopium", "Triangulum", "Triangulum Australe", "Tucana", "Ursa Major", "Ursa Minor", "Vela",
    "Virgo", "Volans", "Vulpecula",
];

function checkCatalog() {
    console.log("\nCATALOG");
    const names = CONSTELLATIONS.map((constellation) => constellation.name).sort();
    check("88 constellations", CONSTELLATIONS.length === 88);
    check("names match the IAU list exactly", JSON.stringify(names) === JSON.stringify([...IAU].sort()));
    check("ids are unique", new Set(CONSTELLATIONS.map((constellation) => constellation.id)).size === CONSTELLATIONS.length);

    for (const constellation of CONSTELLATIONS) {
        const valid = constellation.edges.every(([from, to]) => constellation.stars[from] && constellation.stars[to] && from !== to);
        if (!valid) check(`${constellation.id}: edge indexes valid`, false);
        const inBox = constellation.stars.every((star) => star.x >= 0 && star.x <= 100 && star.y >= 0 && star.y <= 100);
        if (!inBox) check(`${constellation.id}: stars inside the 0–100 box`, false);
        if (!constellation.fact || constellation.span <= 0) check(`${constellation.id}: has a note`, false);
        if (!SKY_REGIONS.some((region) => region.id === constellation.region)) check(`${constellation.id}: known region`, false);
    }
    check("every region has at least 3 constellations", SKY_REGIONS.every((region) => regionConstellations(region.id).length >= PROGRESS_INITIAL_REVEAL));
}

// The first 27 entries must never change: charted stars and prices depend on them.
function checkFrozen() {
    console.log("\nFROZEN FIRST 27");
    type Snapshot = { id: string; region: string; unlockAt: number; stars: [number, number, number, string | null][]; edges: [number, number][]; prices: number[] }[];
    const snapshot = JSON.parse(readFileSync(join(__dirname, "constellations.snapshot.json"), "utf8")) as Snapshot;
    check(`snapshot has 27 entries (${snapshot.length})`, snapshot.length === 27);

    snapshot.forEach((frozen, index) => {
        const current = CONSTELLATIONS[index];
        const same = current
            && current.id === frozen.id
            && current.region === frozen.region
            && current.unlockAt === frozen.unlockAt
            && JSON.stringify(current.stars.map((star) => [star.x, star.y, star.mag, star.name ?? null])) === JSON.stringify(frozen.stars)
            && JSON.stringify(current.edges) === JSON.stringify(frozen.edges)
            && JSON.stringify(current.stars.map((_, star) => starPrice(current, star))) === JSON.stringify(frozen.prices);
        if (!same) check(`${frozen.id} unchanged at index ${index}`, false);
    });
    check("all 27 unchanged (position, stars, edges, prices)", process.exitCode !== 1);
}

function checkLegends() {
    console.log("\nLEGENDS");
    check("legend parts resolve", LEGENDS.every((legend) => legendParts(legend).length > 0));
}

// Galaxy view: real neighbours must sit close on the wrapped RA/Dec map
// (45° allows for the stretch an equirectangular map has near the poles).
function checkNeighbours() {
    console.log("\nGALAXY NEIGHBOURS");
    const position = (id: string) => CONSTELLATIONS.find((constellation) => constellation.id === id)!;
    const distance = (a: string, b: string) => {
        const first = position(a);
        const second = position(b);
        const raDegrees = Math.abs(first.ra - second.ra) * 15;
        const wrapped = Math.min(raDegrees, 360 - raDegrees);
        return Math.hypot(wrapped, first.dec - second.dec);
    };
    for (const [a, b] of [["pegasus", "andromeda"], ["orion", "taurus"], ["taurus", "gemini"], ["ursa-major", "ursa-minor"], ["crux", "centaurus"], ["pisces", "cetus"]]) {
        const degrees = distance(a, b);
        check(`${a} ↔ ${b} within 45° (${degrees.toFixed(0)}°)`, degrees <= 45);
    }
}

// Rough pace: what each region costs to fully chart, against ~50
// Starlight per school day and ~180 school days a year.
function printPacing() {
    console.log("\nPACING (Starlight)");
    const perDay = 50;
    let total = 0;
    let bounties = 0;

    for (const region of SKY_REGIONS) {
        const stars = regionConstellations(region.id).reduce(
            (sum, constellation) => sum + constellation.stars.reduce((inner, _, index) => inner + starPrice(constellation, index), 0),
            0
        );
        const count = regionConstellations(region.id).length;
        total += stars + region.price;
        bounties += region.bounty;
        console.log(`  ${region.name.padEnd(24)} ${String(count).padStart(2)} const · stars ${String(stars).padStart(6)} · fee ${String(region.price).padStart(4)} · opens at ${region.requiresLifetime}`);
    }

    bounties += LEGENDS.reduce((sum, legend) => sum + legend.bounty, 0);
    const earned = total - bounties;
    console.log(`  total spend ${total}, bounties ${bounties}, earned from tasks ≈ ${earned}`);
    console.log(`  ≈ ${Math.round(earned / perDay)} school days ≈ ${(earned / perDay / 180).toFixed(1)} school years at ${perDay}/day`);
}

checkCatalog();
checkFrozen();
checkLegends();
checkNeighbours();
printPacing();
