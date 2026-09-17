"use client";

import type { CSSProperties } from "react";
import { getSpriteRect, SpriteCoord } from "@/lib/spriteSheet";
import { SPRITE_COORDS, SpriteName } from "@/lib/spriteMap";
import { SPRITE_SHEETS, SpriteSheetId } from "@/lib/spriteSheets";

type Props = (
    | { name: SpriteName; coord?: undefined }
    | { name?: undefined; coord: SpriteCoord }
) & {
    sheet: SpriteSheetId;
    scale?: number;
    className?: string;
};

// Slices one tile out of a registered sprite sheet's image
// (lib/spriteSheets.ts) via CSS background-position, matching how
// Building.tsx/PixelBlock.tsx already render (positioned divs, not
// canvas). scale must stay an integer — fractional background-size
// bleeds neighboring-tile pixels on 16px source art. Accepts either a
// catalog `name` (spriteMap.ts, scoped to `sheet`) or a raw `coord` — the
// map editor lets a user pick any sheet cell, not just the ones already
// named.
export default function TileSprite({ name, coord, sheet, scale = 2, className = "" }: Props) {
    const sheetDef = SPRITE_SHEETS[sheet];
    // `coord` is guaranteed defined whenever `name` isn't (Props' union) —
    // but destructuring the two props separately loses that correlation
    // for TS's narrowing, hence the assertion.
    const resolvedCoord: SpriteCoord = name ? SPRITE_COORDS[sheet][name] : (coord as SpriteCoord);
    const rect = getSpriteRect(resolvedCoord, sheet);
    const sheetWidth = sheetDef.columns * sheetDef.tileSize;
    const sheetHeight = sheetDef.rows * sheetDef.tileSize;

    const style: CSSProperties = {
        width: rect.width * scale,
        height: rect.height * scale,
        backgroundImage: `url(${sheetDef.src})`,
        backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
        backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
    };

    return <div className={`shrink-0 ${className}`} style={style} role="img" aria-label={name ?? "custom tile"} />;
}
