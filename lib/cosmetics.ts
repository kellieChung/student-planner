// Nebula cosmetics (Star Chart beta). Appearance only: they never change
// earning, prices, progression or anything in the planner. Bought once with
// Starlight, owned forever, no random rewards. The database catalog
// (CosmeticItem) is seeded from COSMETIC_CATALOG by scripts/seed-cosmetics.ts;
// the look of each item is CSS keyed on its `key` (app/globals.css).

export type CosmeticSlot = "sky" | "lines";

export const COSMETIC_SLOTS: { id: CosmeticSlot; name: string; description: string }[] = [
    { id: "sky", name: "Sky", description: "The background behind the Star Chart and Galaxy." },
    { id: "lines", name: "Constellation lines", description: "How lit lines between stars are drawn." },
];

export type CosmeticCatalogItem = {
    key: string;
    slot: CosmeticSlot;
    name: string;
    description: string;
    cost: number;
    sortOrder: number;
    minLifetime?: number;
    // Fully charted constellations.
    minConstellations?: number;
};

// An item as GET /api/cosmetics returns it.
export type CosmeticItemView = {
    key: string;
    slot: CosmeticSlot;
    name: string;
    description: string;
    cost: number;
    sortOrder: number;
    minLifetime: number | null;
    minConstellations: number | null;
};

// ---------------------------------------------------------------------------
// PLACEHOLDER PRICES: retune after two weeks of beta data. Target the median
// active student, who earns roughly 62 Starlight per school day. Cost 0 is a
// free default (owned by everyone); every slot needs exactly one.
// ---------------------------------------------------------------------------
export const SHIP_NAME_CHANGE_COST = 30;

export const COSMETIC_CATALOG: CosmeticCatalogItem[] = [
    { key: "sky.deep_navy", slot: "sky", name: "Deep Navy", description: "The original night sky.", cost: 0, sortOrder: 0 },
    { key: "sky.midnight_indigo", slot: "sky", name: "Midnight Indigo", description: "A deeper, violet-tinged night.", cost: 150, sortOrder: 1 },
    { key: "sky.notebook", slot: "sky", name: "Notebook", description: "Lined paper with a red margin, stars in pencil.", cost: 250, sortOrder: 2 },
    { key: "sky.chalkboard", slot: "sky", name: "Chalkboard", description: "Green slate scribbled with star math and doodles.", cost: 300, sortOrder: 3 },
    { key: "sky.blueprint", slot: "sky", name: "Blueprint", description: "Cobalt drafting paper with a white grid.", cost: 350, sortOrder: 4 },
    { key: "sky.aurora_wash", slot: "sky", name: "Aurora Wash", description: "A faint green and teal shimmer low on the horizon.", cost: 400, sortOrder: 5 },
    { key: "sky.sea_chart", slot: "sky", name: "Old Sea Chart", description: "Aged parchment, a compass rose and sepia ink.", cost: 450, sortOrder: 6 },
    { key: "sky.dusk", slot: "sky", name: "Dusk", description: "A sunset sky over dark mountains.", cost: 450, sortOrder: 7 },
    { key: "sky.radar", slot: "sky", name: "Radar", description: "A green phosphor screen with a slow sweep.", cost: 500, sortOrder: 8 },
    { key: "sky.milky_way", slot: "sky", name: "Milky Way Band", description: "A soft band of galactic light across the sky.", cost: 600, sortOrder: 9, minConstellations: 3 },
    { key: "sky.synthwave", slot: "sky", name: "Synthwave", description: "A neon grid horizon under a magenta sky.", cost: 600, sortOrder: 10, minConstellations: 3 },

    { key: "lines.classic", slot: "lines", name: "Classic", description: "The original solid gold lines.", cost: 0, sortOrder: 0 },
    { key: "lines.dotted", slot: "lines", name: "Dotted", description: "A trail of fine dots.", cost: 120, sortOrder: 1 },
    { key: "lines.dashed", slot: "lines", name: "Dashed Chart", description: "Navigator's dashes, like an old sea chart.", cost: 200, sortOrder: 2 },
    { key: "lines.sketch", slot: "lines", name: "Pencil Sketch", description: "Grainy graphite strokes, drawn twice by hand.", cost: 200, sortOrder: 3 },
    { key: "lines.neon", slot: "lines", name: "Neon", description: "Thick cyan tubes that glow.", cost: 300, sortOrder: 4 },
    { key: "lines.flowing", slot: "lines", name: "Flowing Light", description: "Light that travels slowly along each line.", cost: 400, sortOrder: 5 },
];
// ---------------------------------------------------------------------------

export const DEFAULT_LOADOUT: Record<CosmeticSlot, string> = {
    sky: "sky.deep_navy",
    lines: "lines.classic",
};

// Every bought sky sets its own palette (app/globals.css data-sky-palette)
// and keeps it in the Day light chart, which only re-skins the default.
export function skyHasOwnPalette(skyKey: string): boolean {
    return skyKey !== DEFAULT_LOADOUT.sky;
}

export function isCosmeticSlot(value: unknown): value is CosmeticSlot {
    return value === "sky" || value === "lines";
}

// The part after the slot, used as the CSS data-attribute value
// ("sky.midnight_indigo" -> "midnight_indigo").
export function cosmeticVariant(key: string): string {
    return key.slice(key.indexOf(".") + 1);
}

export const SHIP_NAME_MAX_LENGTH = 24;
const SHIP_NAME_PATTERN = /^[A-Za-z0-9 .,'!?&-]+$/;

// Trimmed, single-spaced, 1–24 letters/numbers/spaces/basic punctuation.
// Returns the clean name, or an error message.
export function normalizeShipName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
    if (typeof raw !== "string") return { ok: false, error: "Give your ship a name." };

    const name = raw.trim().replace(/\s+/g, " ");

    if (name.length === 0) return { ok: false, error: "Give your ship a name." };
    if (name.length > SHIP_NAME_MAX_LENGTH) return { ok: false, error: `Ship names can be at most ${SHIP_NAME_MAX_LENGTH} characters.` };
    if (!SHIP_NAME_PATTERN.test(name)) {
        return { ok: false, error: "Use letters, numbers, spaces and basic punctuation (. , ' ! ? & -)." };
    }

    return { ok: true, name };
}
