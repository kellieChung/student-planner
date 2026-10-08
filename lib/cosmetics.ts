// Nebula cosmetics (Star Chart beta). Appearance only: they never change
// earning, prices, progression or anything in the planner. Bought once with
// Starlight, owned forever, no random rewards. The database catalog
// (CosmeticItem) is seeded from COSMETIC_CATALOG by scripts/seed-cosmetics.ts;
// the look of each item is CSS keyed on its `key` (app/globals.css).

export type CosmeticSlot = "sky" | "glow" | "lines";

export const COSMETIC_SLOTS: { id: CosmeticSlot; name: string; description: string }[] = [
    { id: "sky", name: "Sky", description: "The background behind the Star Chart and Galaxy." },
    { id: "glow", name: "Star glow", description: "How charted stars shine." },
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
// active student, who earns roughly 50 Starlight per school day. Cost 0 is a
// free default (owned by everyone); every slot needs exactly one.
// ---------------------------------------------------------------------------
export const SHIP_NAME_CHANGE_COST = 100;

export const COSMETIC_CATALOG: CosmeticCatalogItem[] = [
    { key: "sky.deep_navy", slot: "sky", name: "Deep Navy", description: "The original night sky.", cost: 0, sortOrder: 0 },
    { key: "sky.midnight_indigo", slot: "sky", name: "Midnight Indigo", description: "A deeper, violet-tinged night.", cost: 150, sortOrder: 1 },
    { key: "sky.aurora_wash", slot: "sky", name: "Aurora Wash", description: "A faint green and teal shimmer low on the horizon.", cost: 400, sortOrder: 2 },
    { key: "sky.milky_way", slot: "sky", name: "Milky Way Band", description: "A soft band of galactic light across the sky.", cost: 600, sortOrder: 3, minConstellations: 3 },

    { key: "glow.soft", slot: "glow", name: "Soft", description: "The original gentle halo.", cost: 0, sortOrder: 0 },
    { key: "glow.crisp", slot: "glow", name: "Crisp", description: "Sharp, bright points with a tight halo.", cost: 120, sortOrder: 1 },
    { key: "glow.radiant", slot: "glow", name: "Radiant", description: "Wide halos that slowly breathe.", cost: 250, sortOrder: 2 },
    { key: "glow.ember", slot: "glow", name: "Ember", description: "Warm orange stars, like coals.", cost: 250, sortOrder: 3 },

    { key: "lines.classic", slot: "lines", name: "Classic", description: "The original solid gold lines.", cost: 0, sortOrder: 0 },
    { key: "lines.dotted", slot: "lines", name: "Dotted", description: "A trail of fine dots.", cost: 120, sortOrder: 1 },
    { key: "lines.dashed", slot: "lines", name: "Dashed Chart", description: "Navigator's dashes, like an old sea chart.", cost: 200, sortOrder: 2 },
    { key: "lines.fine_ink", slot: "lines", name: "Fine Ink", description: "Hairline strokes in pale ink.", cost: 200, sortOrder: 3 },
];
// ---------------------------------------------------------------------------

export const DEFAULT_LOADOUT: Record<CosmeticSlot, string> = {
    sky: "sky.deep_navy",
    glow: "glow.soft",
    lines: "lines.classic",
};

export function isCosmeticSlot(value: unknown): value is CosmeticSlot {
    return value === "sky" || value === "glow" || value === "lines";
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
