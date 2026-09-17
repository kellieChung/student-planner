"use client";

import { useMemo } from "react";
import { BuildingKey, KingdomStage, TownState } from "@/types/townState";
import { WorldLayoutData } from "@/types/worldLayout";
import { totalTownGrowth } from "@/lib/townGrowth";
import { GROUND_TILE_PX, FRAME_COLS, FRAME_ROWS, FRAME_WIDTH_PX, FRAME_HEIGHT_PX } from "@/lib/mapGrid";
import Building from "./Building";
import TileRefSprite from "./TileRefSprite";

type Props = {
    townState: TownState;
    layout: WorldLayoutData;
};

const BUILDING_LAYOUT: Array<{
    key: BuildingKey;
    field: keyof TownState;
    label: string;
}> = [
    { key: "townSquare", field: "townSquareGrowth", label: "Town Square" },
    { key: "library", field: "libraryGrowth", label: "Library" },
    { key: "workshop", field: "workshopGrowth", label: "Workshop" },
    { key: "trainingGrounds", field: "trainingGroundsGrowth", label: "Training Grounds" },
    { key: "watchtower", field: "watchtowerGrowth", label: "Watchtower" },
];

const KINGDOM_STAGE_ORDER: KingdomStage[] = ["village", "town", "city", "kingdom"];

// Thomas Wang's 32-bit integer hash — deterministic (no Math.random(), so
// no SSR hydration-mismatch risk) but mixes bits enough to avoid the
// visible low-order periodicity a small-coefficient modulo formula
// produces (an earlier version, (row*7+col*13)%11, read as an obvious
// diagonal stripe pattern, not scattered — caught live).
function hashCell(row: number, col: number): number {
    let h = row * FRAME_COLS + col;
    h = (h ^ 61) ^ (h >>> 16);
    h = h + (h << 3);
    h = h ^ (h >>> 4);
    h = Math.imul(h, 0x27d4eb2d);
    h = h ^ (h >>> 15);
    return h >>> 0;
}

// Purely the map itself — Mascot/Hourglass/Bard/laptop-button UI moved
// out to WorldToolbar.tsx (a fixed screen dock, not an in-world object),
// so this component no longer needs onOpenLaptop/dialogue props or
// useWindowManager.
export default function TownMap({ townState, layout }: Props) {
    const growth = totalTownGrowth(townState);

    const wallUnlocked =
        layout.wall !== null &&
        KINGDOM_STAGE_ORDER.indexOf(townState.kingdomStage) >= KINGDOM_STAGE_ORDER.indexOf(layout.wall.unlockStage);

    // Alternating baseA/baseB ("the grid"), with tuftA/tuftB scattered
    // sparsely on top — all four sprites and the density are user-editable
    // (lib/worldLayout.ts's WorldLayoutData.ground). Recomputed only when
    // the ground theme actually changes, not on every render (1800 cells).
    const groundCells = useMemo(() => {
        const cells: Array<{ row: number; col: number; base: WorldLayoutData["ground"]["baseA"]; tuft?: WorldLayoutData["ground"]["tuftA"] }> = [];

        for (let row = 0; row < FRAME_ROWS; row++) {
            for (let col = 0; col < FRAME_COLS; col++) {
                const even = (row + col) % 2 === 0;
                const base = even ? layout.ground.baseA : layout.ground.baseB;
                const hasTuft = hashCell(row, col) % 100 < layout.ground.tuftDensityPercent;
                cells.push({ row, col, base, tuft: hasTuft ? (even ? layout.ground.tuftA : layout.ground.tuftB) : undefined });
            }
        }

        return cells;
    }, [layout.ground]);

    // Fixed logical size, not responsive — MapViewport.tsx (the only way
    // this component should be mounted) measures whatever real container
    // it's given and scales this fixed frame to fit, which is what
    // actually makes the map "get smaller on smaller screens" instead of
    // just clipping. Opaque fallback color, not just the grass grid —
    // LaptopFrame keeps the OS view mounted behind this one
    // (visibility:hidden, per PROGRESS.md), and a hairline sub-pixel gap
    // between tiled sprites would otherwise let it show through.
    return (
        <div
            className="relative overflow-hidden"
            style={{ width: FRAME_WIDTH_PX, height: FRAME_HEIGHT_PX, backgroundColor: "#1f4530" }}
        >
            <div className="absolute inset-0" aria-hidden="true">
                {groundCells.map((cell) => (
                    <div
                        key={`base-${cell.row}-${cell.col}`}
                        className="absolute"
                        style={{ top: cell.row * GROUND_TILE_PX, left: cell.col * GROUND_TILE_PX }}
                    >
                        <TileRefSprite tile={cell.base} scale={3} />
                    </div>
                ))}
                {groundCells
                    .filter((cell) => cell.tuft)
                    .map((cell) => (
                        <div
                            key={`tuft-${cell.row}-${cell.col}`}
                            className="absolute"
                            style={{ top: cell.row * GROUND_TILE_PX, left: cell.col * GROUND_TILE_PX }}
                        >
                            <TileRefSprite tile={cell.tuft!} scale={3} />
                        </div>
                    ))}
            </div>

            {/* Forest/mountain/water/farmland/paths/anything else — fully
                user-placed via /dev/map-editor (lib/worldLayout.ts's
                WorldLayoutData.decorations), painted back-to-front in
                array order. Deliberately not computed/generated: this
                pack's road art is junction-shaped, built for an
                orthogonal grid, so a path only looks right when a person
                places it by eye, not when math interpolates a diagonal
                line through it. */}
            {layout.decorations.map((decoration) => (
                <div
                    key={decoration.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                        top: decoration.row * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                        left: decoration.col * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                    }}
                    aria-hidden="true"
                >
                    <TileRefSprite tile={decoration.tile} scale={decoration.scale} />
                </div>
            ))}

            {/* Purely decorative building instances beyond the 5
                growth-mechanic buildings below — freely added/moved via
                /dev/map-editor's Buildings tab (WorldLayoutData.extraBuildings). */}
            {layout.extraBuildings.map((building) => (
                <div
                    key={building.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                        top: building.row * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                        left: building.col * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                    }}
                    aria-hidden="true"
                >
                    <TileRefSprite tile={building.tile} scale={building.scale} />
                </div>
            ))}

            {layout.scatterHouses.map((house) => (
                growth >= house.growthThreshold && (
                    <div
                        key={house.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                            top: house.row * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                            left: house.col * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                        }}
                        aria-hidden="true"
                    >
                        <TileRefSprite tile={house.tile} scale={house.scale} />
                    </div>
                )
            ))}

            {wallUnlocked && layout.wall && (
                <div
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                        top: layout.wall.row * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                        left: layout.wall.col * GROUND_TILE_PX + GROUND_TILE_PX / 2,
                    }}
                    aria-hidden="true"
                >
                    <TileRefSprite tile={layout.wall.tile} scale={layout.wall.scale} />
                </div>
            )}

            {BUILDING_LAYOUT.map((building) => {
                const pos = layout.buildingPositions[building.key];
                return (
                    <Building
                        key={building.key}
                        buildingKey={building.key}
                        growth={townState[building.field] as number}
                        label={building.label}
                        top={pos.row * GROUND_TILE_PX + GROUND_TILE_PX / 2}
                        left={pos.col * GROUND_TILE_PX + GROUND_TILE_PX / 2}
                        stageSprites={layout.buildingStageSprites[building.key]}
                    />
                );
            })}
        </div>
    );
}
