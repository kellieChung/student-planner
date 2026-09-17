import { SPRITE_SHEETS, SpriteSheetId } from "@/lib/spriteSheets";

export type SpriteCoord = {
    col: number;
    row: number;
    colSpan?: number;
    rowSpan?: number;
};

export type SpriteRect = { x: number; y: number; width: number; height: number };

export function getSpriteRect(coord: SpriteCoord, sheet: SpriteSheetId): SpriteRect {
    const tileSize = SPRITE_SHEETS[sheet].tileSize;
    const colSpan = coord.colSpan ?? 1;
    const rowSpan = coord.rowSpan ?? 1;

    return {
        x: (coord.col - 1) * tileSize,
        y: (coord.row - 1) * tileSize,
        width: colSpan * tileSize,
        height: rowSpan * tileSize,
    };
}
