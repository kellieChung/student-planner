import { SpriteCoord } from "@/lib/spriteSheet";
import { SpriteSheetId } from "@/lib/spriteSheets";

// Coordinates are 1-indexed (col, row) into each sheet's own image,
// matching that pack's own reference-sheet numbering. Each entry below
// was confirmed by cropping the raw sheet at that exact cell and
// inspecting it — don't add a name here from a reference legend alone
// without doing the same crop-and-look check, since spans aren't obvious
// from the legend. Keyed per sheet (lib/spriteSheets.ts) so a future
// pack's names can't collide with this one's.
export const SPRITE_COORDS: Record<SpriteSheetId, Record<string, SpriteCoord>> = {
    toen: {
        // terrain
        grass: { col: 1, row: 1 },
        grass_dark: { col: 2, row: 1 },
        grass_tufted: { col: 3, row: 1 },
        grass_tufted_alt: { col: 4, row: 1 },
        tree_pine: { col: 5, row: 1 },
        tree_cluster_2: { col: 6, row: 1 },
        tree_cluster_3: { col: 7, row: 1 },
        // Confirmed via crop: row2 cols 4-6 are three separate single-cell
        // mountain peaks, not one colSpan:2 sprite — the old `boulder` entry
        // here was never actually used anywhere and was wrong.
        mountain_1: { col: 4, row: 2 },
        mountain_2: { col: 5, row: 2 },
        mountain_3: { col: 6, row: 2 },
        bush: { col: 7, row: 2 },
        water: { col: 5, row: 3 },
        // A 3x3 ring/moat shape with a small central plaza — reads as a lake
        // with a tiny island, confirmed exact bounds via a grid-overlay crop
        // (col1-3, row14-16). The adjacent col4-6 shapes at the same rows are
        // T/cross-shaped water *channels* (same junction-icon pattern as the
        // roads below), not open ponds — not cataloged, not the right fit.
        water_pond_big: { col: 1, row: 14, colSpan: 3, rowSpan: 3 },
        crop_field_green: { col: 7, row: 7 },
        crop_field_orange: { col: 7, row: 8 },

        // roads — junction-shaped chunks only (confirmed: no straight/corner
        // segments exist anywhere in rows 1-20 or 32-38). road_dirt_bend and
        // road_stone_junction are drawn to sit flush against each other
        // (dirt visually dissolving into stone at the col4/col5 seam) —
        // placed side by side they read as one continuous "dirt path becomes
        // a paved road" piece; used as a chain of trail tiles between
        // buildings, not a single decorative accent.
        road_dirt_junction: { col: 1, row: 10, colSpan: 2 },
        road_dirt_bend: { col: 3, row: 10, colSpan: 2 },
        // Was col:3 — that half of the dirt->stone transition sprite is still
        // dirt-colored; col:5 is the actually-stone-colored portion.
        road_stone_junction: { col: 5, row: 10, colSpan: 2 },

        // buildings — small/starter tier
        house_small: { col: 1, row: 2 },
        house_small_2win: { col: 2, row: 2 },
        house_cluster_red_sm: { col: 3, row: 2 },
        house_red_roof: { col: 4, row: 3 },
        house_tower_manor: { col: 2, row: 3 },
        castle_tower: { col: 2, row: 4 },

        // buildings — upgraded tier
        castle_wall: { col: 2, row: 5, colSpan: 6 },
        town_walled: { col: 1, row: 8, colSpan: 2, rowSpan: 2 },
        town_wood_fenced: { col: 3, row: 8, colSpan: 2, rowSpan: 2 },
        town_fortress: { col: 5, row: 8, colSpan: 2, rowSpan: 2 },
    },
};

// A sprite name is only unique within its own sheet — always paired with
// a SpriteSheetId (types/worldLayout.ts's TileRef) wherever it's stored,
// and validated at runtime against SPRITE_COORDS[sheet] (lib/worldLayout.ts's
// isValidTileRef) rather than as a compile-time literal union, since the
// catalog now spans an open-ended, growing set of sheets.
export type SpriteName = string;
