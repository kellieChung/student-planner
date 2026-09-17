"use client";

import { TileRef } from "@/types/worldLayout";
import TileSprite from "./TileSprite";

type Props = {
    tile: TileRef;
    scale?: number;
    className?: string;
};

// Thin adapter so call sites holding a TileRef (named or raw, and now
// sheet-aware — see types/worldLayout.ts) don't each have to branch
// between TileSprite's `name`/`coord` props.
export default function TileRefSprite({ tile, scale, className }: Props) {
    return tile.kind === "named" ? (
        <TileSprite name={tile.name} sheet={tile.sheet} scale={scale} className={className} />
    ) : (
        <TileSprite coord={tile.coord} sheet={tile.sheet} scale={scale} className={className} />
    );
}
