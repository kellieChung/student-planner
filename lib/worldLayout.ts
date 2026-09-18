import { SpriteCoord } from "@/lib/spriteSheet";
import { SpriteName, SPRITE_COORDS } from "@/lib/spriteMap";
import { SPRITE_SHEETS, SpriteSheetId } from "@/lib/spriteSheets";
import { BuildingKey, KingdomStage } from "@/types/townState";
import { PlacedTile, TileRef, WorldLayoutData } from "@/types/worldLayout";
import { CONTENT_COLS, CONTENT_ROWS, MARGIN_COLS, MARGIN_ROWS } from "@/lib/mapGrid";

const KNOWN_SHEET_IDS = new Set(Object.keys(SPRITE_SHEETS));
const KNOWN_SPRITE_NAMES: Record<SpriteSheetId, Set<string>> = Object.fromEntries(
    Object.entries(SPRITE_COORDS).map(([sheet, coords]) => [sheet, new Set(Object.keys(coords))])
) as Record<SpriteSheetId, Set<string>>;
const KNOWN_KINGDOM_STAGES: KingdomStage[] = ["village", "town", "city", "kingdom"];
const KNOWN_BUILDING_KEYS: BuildingKey[] = ["library", "workshop", "trainingGrounds", "watchtower", "townSquare"];

// A raw coordinate the editor's picker produced that happens to exactly
// match an already-cataloged sprite (on the same sheet) is stored as
// that name instead — more readable in the saved JSON, and it stays
// correct if that sprite's definition is ever tightened up in
// spriteMap.ts.
export function coordToTileRef(coord: SpriteCoord, sheet: SpriteSheetId): TileRef {
    const match = (Object.entries(SPRITE_COORDS[sheet]) as Array<[SpriteName, SpriteCoord]>).find(
        ([, candidate]) =>
            candidate.col === coord.col &&
            candidate.row === coord.row &&
            (candidate.colSpan ?? 1) === (coord.colSpan ?? 1) &&
            (candidate.rowSpan ?? 1) === (coord.rowSpan ?? 1)
    );

    return match ? { kind: "named", sheet, name: match[0] } : { kind: "raw", sheet, coord };
}

export function tileRefCoord(ref: TileRef): SpriteCoord {
    return ref.kind === "named" ? SPRITE_COORDS[ref.sheet][ref.name] : ref.coord;
}

export function tileRefLabel(ref: TileRef): string {
    if (ref.kind === "named") return ref.name;
    const { col, row, colSpan, rowSpan } = ref.coord;
    return `col${col},row${row}${colSpan && colSpan > 1 ? ` (${colSpan}w)` : ""}${rowSpan && rowSpan > 1 ? ` (${rowSpan}h)` : ""}`;
}

// Convenience for DEFAULT_WORLD_LAYOUT below, where every sprite comes
// from the one pack that currently exists — a future second pack's
// content wouldn't use this helper, just `{kind:"named", sheet, name}`
// directly.
function toenNamed(name: SpriteName): TileRef {
    return { kind: "named", sheet: "toen", name };
}

// One-time best-effort conversion from the percent-of-viewport numbers
// this layout was originally hand-tuned with, to the grid-cell
// coordinates the map now actually stores (types/worldLayout.ts's
// PlacedTile), scaled against CONTENT_COLS/ROWS — the "main area" this
// layout was tuned to fill — then offset by MARGIN_COLS/ROWS
// (lib/mapGrid.ts) so it lands centered within the actual, bigger
// FRAME_COLS x FRAME_ROWS grid (content plus a real grass buffer on
// every side). This can't be an exact conversion — the old percentages
// were relative to whatever container width was on screen while tuning
// — but it keeps the default layout recognizable, and fixing it
// precisely by hand in the editor is the whole point of that tool.
function toGrid(percent: number, cells: number): number {
    return Math.round((percent / 100) * cells);
}

function gridRow(topPercent: number): number {
    return MARGIN_ROWS + toGrid(topPercent, CONTENT_ROWS);
}

function gridCol(leftPercent: number): number {
    return MARGIN_COLS + toGrid(leftPercent, CONTENT_COLS);
}

function tile(id: string, name: SpriteName, topPercent: number, leftPercent: number, scale: number): PlacedTile {
    return { id, tile: toenNamed(name), row: gridRow(topPercent), col: gridCol(leftPercent), scale };
}

// Ported 1:1 from the hardcoded arrays TownMap.tsx used before this became
// data-driven — the point is zero visual change until the user actually
// opens /dev/map-editor and changes something. The path tiles here are the
// same ones the user was mid-way through complaining about (they don't
// read as connected on a diagonal); that's expected — fixing them by hand
// in the editor is the whole reason this exists, not something to
// silently improve on their behalf here.
export const DEFAULT_WORLD_LAYOUT: WorldLayoutData = {
    ground: {
        baseA: toenNamed("grass"),
        baseB: toenNamed("grass_dark"),
        tuftA: toenNamed("grass_tufted"),
        tuftB: toenNamed("grass_tufted_alt"),
        tuftDensityPercent: 9,
    },
    decorations: [
        tile("forest-1", "tree_pine", 10, 34, 3),
        tile("forest-2", "tree_cluster_2", 13, 39, 3),
        tile("forest-3", "tree_cluster_3", 10, 44, 3),
        tile("mountain-1", "mountain_1", 9, 62, 3),
        tile("mountain-2", "mountain_2", 13, 67, 3),
        tile("mountain-3", "mountain_3", 9, 72, 3),
        tile("farmland-1", "crop_field_green", 70, 32, 3),
        tile("farmland-2", "crop_field_orange", 70, 38, 3),
        tile("pond-1", "water_pond_big", 60, 10, 3),
        tile("pond-2", "water_pond_big", 60, 90, 3),
        tile("accent-tree", "tree_pine", 10, 50, 3),
        tile("path-library-1", "road_dirt_junction", 42.4, 34, 2),
        tile("path-library-2", "road_dirt_junction", 46.4, 38, 2),
        tile("path-library-3", "road_dirt_bend", 49, 41, 2),
        tile("path-library-4", "road_stone_junction", 51.6, 44, 2),
        tile("path-library-5", "road_stone_junction", 55.6, 48, 2),
        tile("path-workshop-1", "road_dirt_junction", 42.4, 66, 2),
        tile("path-workshop-2", "road_dirt_junction", 46.4, 62, 2),
        tile("path-workshop-3", "road_dirt_bend", 49, 66, 2),
        tile("path-workshop-4", "road_stone_junction", 51.6, 70, 2),
        tile("path-workshop-5", "road_stone_junction", 55.6, 74, 2),
        tile("path-training-1", "road_dirt_junction", 61.9, 34, 2),
        tile("path-training-2", "road_dirt_junction", 65.9, 38, 2),
        tile("path-training-3", "road_dirt_bend", 67.6, 34, 2),
        tile("path-training-4", "road_stone_junction", 71.6, 30, 2),
        tile("path-training-5", "road_stone_junction", 75.6, 26, 2),
        tile("path-watchtower-1", "road_dirt_junction", 61.9, 66, 2),
        tile("path-watchtower-2", "road_dirt_junction", 65.9, 62, 2),
        tile("path-watchtower-3", "road_dirt_bend", 67.6, 66, 2),
        tile("path-watchtower-4", "road_stone_junction", 71.6, 70, 2),
        tile("path-watchtower-5", "road_stone_junction", 75.6, 74, 2),
    ],
    buildingStageSprites: {
        library: [toenNamed("grass"), toenNamed("house_small"), toenNamed("town_walled")],
        workshop: [toenNamed("grass"), toenNamed("house_small_2win"), toenNamed("house_tower_manor")],
        trainingGrounds: [toenNamed("grass"), toenNamed("house_cluster_red_sm"), toenNamed("town_fortress")],
        watchtower: [toenNamed("grass"), toenNamed("castle_tower"), toenNamed("castle_wall")],
        townSquare: [toenNamed("grass"), toenNamed("house_red_roof"), toenNamed("town_wood_fenced")],
    },
    // Same one-time percent-to-grid conversion as tile() above, applied to
    // the positions TownMap.tsx used to hardcode directly.
    buildingPositions: {
        townSquare: { row: gridRow(58), col: gridCol(50) },
        library: { row: gridRow(24), col: gridCol(18) },
        workshop: { row: gridRow(24), col: gridCol(82) },
        trainingGrounds: { row: gridRow(84), col: gridCol(18) },
        watchtower: { row: gridRow(84), col: gridCol(82) },
    },
    extraBuildings: [],
    scatterHouses: [
        { id: "scatter-1", tile: toenNamed("house_small"), row: gridRow(36), col: gridCol(30), scale: 2, growthThreshold: 150 },
        { id: "scatter-2", tile: toenNamed("house_small_2win"), row: gridRow(36), col: gridCol(70), scale: 2, growthThreshold: 300 },
        { id: "scatter-3", tile: toenNamed("house_cluster_red_sm"), row: gridRow(64), col: gridCol(30), scale: 2, growthThreshold: 450 },
        { id: "scatter-4", tile: toenNamed("house_red_roof"), row: gridRow(64), col: gridCol(70), scale: 2, growthThreshold: 600 },
        { id: "scatter-5", tile: toenNamed("house_small"), row: gridRow(50), col: gridCol(20), scale: 2, growthThreshold: 750 },
        { id: "scatter-6", tile: toenNamed("house_small_2win"), row: gridRow(50), col: gridCol(80), scale: 2, growthThreshold: 900 },
    ],
    wall: { id: "wall", tile: toenNamed("castle_wall"), row: gridRow(3), col: gridCol(50), scale: 3, unlockStage: "city" },
};

function isValidTileRef(value: unknown): value is TileRef {
    if (!value || typeof value !== "object") return false;
    const ref = value as Record<string, unknown>;

    if (typeof ref.sheet !== "string" || !KNOWN_SHEET_IDS.has(ref.sheet)) return false;
    const sheet = ref.sheet as SpriteSheetId;

    if (ref.kind === "named") return typeof ref.name === "string" && KNOWN_SPRITE_NAMES[sheet].has(ref.name);

    if (ref.kind === "raw") {
        const coord = ref.coord as Record<string, unknown> | undefined;
        if (!coord || typeof coord.col !== "number" || typeof coord.row !== "number") return false;
        if (coord.colSpan !== undefined && typeof coord.colSpan !== "number") return false;
        if (coord.rowSpan !== undefined && typeof coord.rowSpan !== "number") return false;
        return true;
    }

    return false;
}

function isValidPlacedTile(value: unknown): value is PlacedTile {
    if (!value || typeof value !== "object") return false;
    const placed = value as Record<string, unknown>;

    return (
        typeof placed.id === "string" &&
        isValidTileRef(placed.tile) &&
        typeof placed.row === "number" && Number.isFinite(placed.row) &&
        typeof placed.col === "number" && Number.isFinite(placed.col) &&
        typeof placed.scale === "number" && Number.isInteger(placed.scale) && placed.scale > 0
    );
}

// Loose runtime validation for the PATCH body — this is a personal tool,
// not multi-tenant SaaS, but a malformed save (a typo'd sprite name, an
// out-of-range percent) must not be able to crash TownMap's renderer for
// every future page load.
export function isValidWorldLayoutData(value: unknown): value is WorldLayoutData {
    if (!value || typeof value !== "object") return false;
    const data = value as Record<string, unknown>;

    const ground = data.ground as Record<string, unknown> | undefined;
    if (!ground) return false;
    if (!isValidTileRef(ground.baseA) || !isValidTileRef(ground.baseB)) return false;
    if (!isValidTileRef(ground.tuftA) || !isValidTileRef(ground.tuftB)) return false;
    if (typeof ground.tuftDensityPercent !== "number" || ground.tuftDensityPercent < 0 || ground.tuftDensityPercent > 100) {
        return false;
    }

    if (!Array.isArray(data.decorations) || !data.decorations.every(isValidPlacedTile)) return false;
    if (!Array.isArray(data.extraBuildings) || !data.extraBuildings.every(isValidPlacedTile)) return false;

    const stageSprites = data.buildingStageSprites as Record<string, unknown> | undefined;
    if (!stageSprites) return false;
    for (const key of KNOWN_BUILDING_KEYS) {
        const stages = stageSprites[key];
        if (!Array.isArray(stages) || stages.length !== 3 || !stages.every(isValidTileRef)) return false;
    }

    const buildingPositions = data.buildingPositions as Record<string, unknown> | undefined;
    if (!buildingPositions) return false;
    for (const key of KNOWN_BUILDING_KEYS) {
        const pos = buildingPositions[key] as Record<string, unknown> | undefined;
        if (!pos || typeof pos.row !== "number" || typeof pos.col !== "number") return false;
    }

    if (!Array.isArray(data.scatterHouses)) return false;
    for (const house of data.scatterHouses) {
        if (!isValidPlacedTile(house)) return false;
        if (typeof (house as { growthThreshold?: unknown }).growthThreshold !== "number") return false;
    }

    if (data.wall !== null) {
        if (!isValidPlacedTile(data.wall)) return false;
        const unlockStage = (data.wall as { unlockStage?: unknown }).unlockStage;
        if (typeof unlockStage !== "string" || !KNOWN_KINGDOM_STAGES.includes(unlockStage as KingdomStage)) return false;
    }

    return true;
}

// Moves every positioned item by the same (deltaRow, deltaCol) — used by
// the map editor's bulk-recenter tool (drag the whole content area, or
// the one-click "Center Content" button) so a layout tuned against an
// older, narrower margin (lib/mapGrid.ts's MARGIN_COLS/ROWS) can be
// re-centered as one block without re-placing every decoration/path
// tile by hand. Every relative position — the pathing — stays pixel-
// identical; only where the whole block sits in the frame changes.
export function shiftLayout(layout: WorldLayoutData, deltaRow: number, deltaCol: number): WorldLayoutData {
    const shiftTile = <T extends PlacedTile>(item: T): T => ({ ...item, row: item.row + deltaRow, col: item.col + deltaCol });

    return {
        ...layout,
        decorations: layout.decorations.map(shiftTile),
        extraBuildings: layout.extraBuildings.map(shiftTile),
        scatterHouses: layout.scatterHouses.map(shiftTile),
        wall: layout.wall ? shiftTile(layout.wall) : null,
        buildingPositions: Object.fromEntries(
            KNOWN_BUILDING_KEYS.map((key) => [key, { row: layout.buildingPositions[key].row + deltaRow, col: layout.buildingPositions[key].col + deltaCol }])
        ) as WorldLayoutData["buildingPositions"],
    };
}

// Anchor-cell collision check — true if some existing decoration, extra
// building, scatter house, fixed building, or the wall already sits at
// this exact (row, col). Used by the map editor's random-pool brushes
// (terrain/scatter-house) so an automatic fill never stacks a new item
// directly on top of something already placed; a manual click/drag is
// unaffected by this (it never called this function before and still
// doesn't), so overriding by hand afterward still works exactly as
// before. This checks anchor points only, not each sprite's real pixel
// footprint at its stored `scale` — a scale>1 item can still visually
// extend past a neighboring "free" cell; a simple, deliberate scope
// match for "don't place directly on top of," not full bounding-box
// collision.
export function isCellOccupied(layout: WorldLayoutData, row: number, col: number): boolean {
    const hits = (items: PlacedTile[]) => items.some((item) => item.row === row && item.col === col);

    if (hits(layout.decorations)) return true;
    if (hits(layout.extraBuildings)) return true;
    if (hits(layout.scatterHouses)) return true;
    if (Object.values(layout.buildingPositions).some((pos) => pos.row === row && pos.col === col)) return true;
    if (layout.wall && layout.wall.row === row && layout.wall.col === col) return true;

    return false;
}

export async function getWorldLayout(): Promise<WorldLayoutData> {
    try {
        const response = await fetch("/api/world-layout");

        if (!response.ok) return DEFAULT_WORLD_LAYOUT;

        const data = (await response.json()) as { layout?: unknown };

        return isValidWorldLayoutData(data.layout) ? data.layout : DEFAULT_WORLD_LAYOUT;
    } catch {
        return DEFAULT_WORLD_LAYOUT;
    }
}

export async function saveWorldLayout(layout: WorldLayoutData): Promise<boolean> {
    try {
        const response = await fetch("/api/world-layout", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layout }),
        });

        return response.ok;
    } catch {
        return false;
    }
}
