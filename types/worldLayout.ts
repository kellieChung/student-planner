import { SpriteCoord } from "@/lib/spriteSheet";
import { SpriteName } from "@/lib/spriteMap";
import { SpriteSheetId } from "@/lib/spriteSheets";
import { BuildingKey, KingdomStage } from "@/types/townState";

// A tile reference is either a catalog name (spriteMap.ts's SpriteName) or
// a raw sheet coordinate for a tile that isn't named yet — the map editor
// supports picking literally any cell on the sheet, not just the ones
// already cataloged. `sheet` says which registered sprite sheet
// (lib/spriteSheets.ts) the name/coord belongs to — a name is only
// unique within its own sheet.
export type TileRef =
    | { kind: "named"; sheet: SpriteSheetId; name: SpriteName }
    | { kind: "raw"; sheet: SpriteSheetId; coord: SpriteCoord };

// row/col are grid-cell coordinates on the same fixed-pixel grid the
// ground uses (lib/mapGrid.ts) — NOT a percent of the container. Percent
// positioning was tried first and doesn't work: it's relative to
// whatever container width happened to be on screen when a tile was
// placed, while the ground grid is a fixed-pixel grid that never scales
// with the container, so a percent position drifts off the grid at any
// other viewport width (this is why hand-placed paths didn't line up
// with buildings).
export type PlacedTile = {
    id: string;
    tile: TileRef;
    row: number;
    col: number;
    scale: number; // integer, TileSprite's own constraint
};

export type ScatterHouseSlot = PlacedTile & { growthThreshold: number };

export type WallConfig = PlacedTile & { unlockStage: KingdomStage };

export type WorldLayoutData = {
    ground: {
        baseA: TileRef;
        baseB: TileRef;
        tuftA: TileRef;
        tuftB: TileRef;
        tuftDensityPercent: number;
    };
    // Forest/mountain/water/farmland/paths/anything freeform — user-placed
    // and user-ordered (painted back-to-front in array order).
    decorations: PlacedTile[];
    buildingStageSprites: Record<BuildingKey, [TileRef, TileRef, TileRef]>;
    buildingPositions: Record<BuildingKey, { row: number; col: number }>;
    // Purely decorative building instances beyond the 5 growth-mechanic
    // buildings above — freely added/moved/deleted exactly like
    // `decorations`, just categorized separately so the map editor's
    // Buildings tab can manage its own list.
    extraBuildings: PlacedTile[];
    scatterHouses: ScatterHouseSlot[];
    wall: WallConfig | null;
};
