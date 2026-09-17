// Registry of sprite sheets the World map can pull tiles from. Adding a
// future pack is meant to be exactly this: drop the PNG under
// public/tiles/, add one entry here (id/label/src/tileSize/columns/rows/
// usableRowLimit) — no other code changes are required before the map
// editor's sheet switcher and picker grid pick it up. No in-app upload UI
// by design: this app has no writable image storage at runtime (public/
// is static), so a code-level registry is the right fit for a solo
// project's own asset additions.
export type SpriteSheetId = "toen";

export type SpriteSheetDef = {
    id: SpriteSheetId;
    label: string;
    src: string; // public/ path
    tileSize: number;
    columns: number;
    rows: number;
    // Rows at/after this index (1-based) may be non-sprite content (e.g.
    // a baked-in attribution graphic) and should never be picked from.
    usableRowLimit: number;
};

export const SPRITE_SHEETS: Record<SpriteSheetId, SpriteSheetDef> = {
    toen: {
        id: "toen",
        label: "Toen's Medieval Strategy",
        src: "/tiles/toen-medieval-strategy.png",
        tileSize: 16,
        columns: 7,
        rows: 52,
        usableRowLimit: 45,
    },
};
