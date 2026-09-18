"use client";

import { useMemo, useRef, useState } from "react";
import { TownState, BuildingKey, KingdomStage } from "@/types/townState";
import { PlacedTile, ScatterHouseSlot, TileRef, WorldLayoutData } from "@/types/worldLayout";
import { getSpriteRect, SpriteCoord } from "@/lib/spriteSheet";
import { SPRITE_COORDS, SpriteName } from "@/lib/spriteMap";
import { SPRITE_SHEETS, SpriteSheetId } from "@/lib/spriteSheets";
import { coordToTileRef, isCellOccupied, saveWorldLayout, shiftLayout, tileRefCoord, tileRefLabel } from "@/lib/worldLayout";
import { DEFAULT_WORLD_LAYOUT } from "@/lib/worldLayout";
import { GROUND_TILE_PX, FRAME_COLS, FRAME_ROWS, CONTENT_COLS, CONTENT_ROWS, MARGIN_COLS, MARGIN_ROWS } from "@/lib/mapGrid";
import TileSprite from "@/components/world/TileSprite";
import TileRefSprite from "@/components/world/TileRefSprite";
import TownMap from "@/components/world/TownMap";
import MapViewport from "@/components/world/MapViewport";
import { STAGE_SCALE } from "@/components/world/Building";

type Props = {
    initialLayout: WorldLayoutData;
    initialTownState: TownState;
};

type Tab = "ground" | "decorations" | "buildings" | "scatterHouses" | "wall";

const TABS: Array<{ id: Tab; label: string }> = [
    { id: "ground", label: "Ground" },
    { id: "decorations", label: "Decorations" },
    { id: "buildings", label: "Buildings" },
    { id: "scatterHouses", label: "Scatter Houses" },
    { id: "wall", label: "Wall" },
];

const BUILDING_KEYS: BuildingKey[] = ["library", "workshop", "trainingGrounds", "watchtower", "townSquare"];
const BUILDING_LABELS: Record<BuildingKey, string> = {
    library: "Library",
    workshop: "Workshop",
    trainingGrounds: "Training Grounds",
    watchtower: "Watchtower",
    townSquare: "Town Square",
};
const KINGDOM_STAGES: KingdomStage[] = ["village", "town", "city", "kingdom"];
const PICKER_SCALE = 5;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

// Matches lib/mapGrid.ts's GROUND_TILE_PX — placements/handles are sized
// and positioned in these same logical (pre-transform) pixels, since
// they're rendered inside MapViewport's fixed-size, transformed inner
// frame alongside everything else on the map.
const GRID_PX = GROUND_TILE_PX;

// The canvas overlay (canvasRef) is a child of MapViewport's transformed
// frame, so its own getBoundingClientRect() always reports the true
// post-pan/zoom rendered box — dividing a click's position by that
// rect's own width/height and multiplying by FRAME_COLS/FRAME_ROWS gives
// the correct grid cell at any zoom/pan state, with no need to know the
// current transform explicitly.
function clientToGrid(clientX: number, clientY: number, rect: DOMRect): { row: number; col: number } {
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    return { row: Math.round((y / rect.height) * FRAME_ROWS), col: Math.round((x / rect.width) * FRAME_COLS) };
}

// Same idea as clientToGrid, but returns the raw logical pixel position
// instead of a rounded grid cell — the eraser brush needs this for
// precise hit-testing against each item's actual rendered box (which can
// span well past its own anchor cell once scale > 1), not just whichever
// single cell the cursor's currently closest to.
function clientToLogicalPoint(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    return { x: (x / rect.width) * FRAME_COLS * GRID_PX, y: (y / rect.height) * FRAME_ROWS * GRID_PX };
}

function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
}

// Module-level (not nested inside MapEditor) so the impure Math.random()
// call here isn't flagged as a potential render-purity violation — it's
// only ever invoked from the two random-pool brushes' placement
// callbacks (pointer-event-driven, never during render), same reasoning
// as newId() above already being module-level.
function pickRandomTile(slots: (TileRef | null)[]): TileRef | null {
    const filled = slots.filter((slot): slot is TileRef => slot !== null);
    if (filled.length === 0) return null;
    return filled[Math.floor(Math.random() * filled.length)];
}

// The eraser's hit-test box — identical math to the drag-handle rendering
// below (center at row/col's cell center, sized by the sprite's own
// pixel rect times this item's scale), just expressed as a plain
// top/left/width/height rectangle instead of CSS.
function itemFootprint(item: PlacedTile) {
    const spriteRect = getSpriteRect(tileRefCoord(item.tile), item.tile.sheet);
    const width = spriteRect.width * item.scale;
    const height = spriteRect.height * item.scale;
    return {
        left: item.col * GRID_PX + GRID_PX / 2 - width / 2,
        top: item.row * GRID_PX + GRID_PX / 2 - height / 2,
        width,
        height,
    };
}

function hitTestItem(item: PlacedTile, x: number, y: number): boolean {
    const box = itemFootprint(item);
    return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                {title}
            </p>
            {children}
        </div>
    );
}

function SmallButton({
    onClick,
    active,
    children,
}: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-transform hover:scale-105"
            style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                background: active ? "var(--accent-soft)" : "var(--panel-muted)",
                color: "var(--heading)",
            }}
        >
            {children}
        </button>
    );
}

const BRUSH_POOL_SIZE = 10;

// Shared pool-slot UI for the two random-pool brushes (scatter houses,
// terrain). A slot is populated by "select a tile in the sprite picker
// below, then click a slot" — the exact same assign-from-current-brush
// interaction the Ground tab's base/tuft slots already use, so no new
// picker UI is needed.
function TileSlotPicker({
    slots,
    onAssign,
    onClear,
}: {
    slots: (TileRef | null)[];
    onAssign: (index: number) => void;
    onClear: (index: number) => void;
}) {
    return (
        <div className="grid grid-cols-5 gap-1.5">
            {slots.map((slot, index) => (
                <div key={index} className="relative">
                    <button
                        type="button"
                        onClick={() => onAssign(index)}
                        title={slot ? `${tileRefLabel(slot)} — click to replace with current brush` : "Click to assign current brush"}
                        className="flex h-10 w-full items-center justify-center rounded-lg border transition-transform hover:scale-105"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
                    >
                        {slot ? (
                            <TileRefSprite tile={slot} scale={1} />
                        ) : (
                            <span className="text-sm" style={{ color: "var(--muted)" }}>
                                +
                            </span>
                        )}
                    </button>
                    {slot && (
                        <button
                            type="button"
                            onClick={() => onClear(index)}
                            title="Clear slot"
                            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] leading-none"
                            style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--muted)" }}
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

export default function MapEditor({ initialLayout, initialTownState }: Props) {
    const [layout, setLayout] = useState<WorldLayoutData>(initialLayout);
    const [activeTab, setActiveTab] = useState<Tab>("decorations");
    const [pickerSheet, setPickerSheet] = useState<SpriteSheetId>("toen");
    const [brush, setBrush] = useState<{ sheet: SpriteSheetId; col: number; row: number; colSpan: number; rowSpan: number }>({
        sheet: "toen",
        col: 1,
        row: 1,
        colSpan: 1,
        rowSpan: 1,
    });
    const [selected, setSelected] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [toolsOpen, setToolsOpen] = useState(true);
    const [guidesOn, setGuidesOn] = useState(false);
    const [zoomScale, setZoomScale] = useState<number | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Brush tools — ephemeral editor-session tool config, never saved to
    // WorldLayoutData/the DB. A brush-placed tile is a completely
    // ordinary PlacedTile/ScatterHouseSlot once placed, indistinguishable
    // from one placed by a single manual click.
    const [buildingsMode, setBuildingsMode] = useState<"place" | "brush" | "erase">("place");
    const [decorationsMode, setDecorationsMode] = useState<"place" | "brush" | "terrain" | "erase">("place");
    const [houseMode, setHouseMode] = useState<"place" | "brush" | "erase">("place");
    const [houseBrushSlots, setHouseBrushSlots] = useState<(TileRef | null)[]>(() => Array(BRUSH_POOL_SIZE).fill(null));
    const [houseBrushThreshold, setHouseBrushThreshold] = useState(150);
    const [terrainBrushSlots, setTerrainBrushSlots] = useState<(TileRef | null)[]>(() => Array(BRUSH_POOL_SIZE).fill(null));

    const brushRef: TileRef = useMemo(() => coordToTileRef(brush, brush.sheet), [brush]);

    // "buildings" doubles as the freeform extra-buildings list — the 5
    // fixed growth buildings (drag-only, rendered separately below) live
    // alongside these, added by clicking empty canvas space exactly like
    // decorations/scatterHouses.
    const activeList: "decorations" | "scatterHouses" | "extraBuildings" | null =
        activeTab === "decorations"
            ? "decorations"
            : activeTab === "scatterHouses"
              ? "scatterHouses"
              : activeTab === "buildings"
                ? "extraBuildings"
                : null;

    const selectedInActiveList = activeList ? (layout[activeList] as PlacedTile[]).some((item) => item.id === selected) : false;

    function switchPickerSheet(sheet: SpriteSheetId) {
        setPickerSheet(sheet);
        setBrush({ sheet, col: 1, row: 1, colSpan: 1, rowSpan: 1 });
    }

    function pickCell(col: number, row: number) {
        setBrush({ sheet: pickerSheet, col, row, colSpan: 1, rowSpan: 1 });
    }

    function pickNamed(name: SpriteName) {
        const coord = SPRITE_COORDS[pickerSheet][name] as SpriteCoord;
        setBrush({ sheet: pickerSheet, col: coord.col, row: coord.row, colSpan: coord.colSpan ?? 1, rowSpan: coord.rowSpan ?? 1 });
    }

    function addPlacementAt(row: number, col: number) {
        if (activeTab === "decorations") {
            const item: PlacedTile = { id: newId(), tile: brushRef, row, col, scale: 3 };
            setLayout((current) => ({ ...current, decorations: [...current.decorations, item] }));
            setSelected(item.id);
        } else if (activeTab === "scatterHouses") {
            const item: ScatterHouseSlot = {
                id: newId(),
                tile: brushRef,
                row,
                col,
                scale: 2,
                growthThreshold: 150,
            };
            setLayout((current) => ({ ...current, scatterHouses: [...current.scatterHouses, item] }));
            setSelected(item.id);
        } else if (activeTab === "buildings") {
            const item: PlacedTile = { id: newId(), tile: brushRef, row, col, scale: 3 };
            setLayout((current) => ({ ...current, extraBuildings: [...current.extraBuildings, item] }));
            setSelected(item.id);
        } else if (activeTab === "wall") {
            setLayout((current) => ({
                ...current,
                wall: { id: "wall", tile: brushRef, row, col, scale: 3, unlockStage: current.wall?.unlockStage ?? "city" },
            }));
        }
    }

    function isBrushModeActive(): boolean {
        if (activeTab === "buildings") return buildingsMode !== "place";
        if (activeTab === "decorations") return decorationsMode !== "place";
        if (activeTab === "scatterHouses") return houseMode !== "place";
        return false;
    }

    function handleCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
        if (!canvasRef.current) return;
        if (activeTab !== "decorations" && activeTab !== "scatterHouses" && activeTab !== "buildings" && activeTab !== "wall") return;
        // While a brush mode is active, placement happens via
        // startPaintStroke's own onPointerDown/pointermove loop below —
        // this native click (which always follows a pointerdown/up pair)
        // would otherwise place one extra, duplicate tile at the last
        // painted cell.
        if (isBrushModeActive()) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const { row, col } = clientToGrid(event.clientX, event.clientY, rect);
        addPlacementAt(row, col);
    }

    // Shared drag-to-paint gesture for every brush mode below — modeled
    // directly on startDrag: stopPropagation immediately (the same
    // mechanism every existing per-item drag handle already relies on to
    // stop MapViewport's own pan gesture from starting), place the
    // starting cell, then keep placing as the pointer crosses into a new
    // cell until it's released. Only ever attached while some brush mode
    // is active (see handleCanvasPointerDown below) — with every mode
    // off, the canvas has no onPointerDown of its own, so a background
    // drag still pans exactly as it does today.
    function startPaintStroke(event: React.PointerEvent, place: (row: number, col: number, x: number, y: number) => void) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();

        const compute = (clientX: number, clientY: number) => ({
            cell: clientToGrid(clientX, clientY, rect),
            point: clientToLogicalPoint(clientX, clientY, rect),
        });

        let last = compute(event.clientX, event.clientY);
        place(last.cell.row, last.cell.col, last.point.x, last.point.y);

        const handleMove = (moveEvent: PointerEvent) => {
            const next = compute(moveEvent.clientX, moveEvent.clientY);
            if (next.cell.row === last.cell.row && next.cell.col === last.cell.col) return;
            last = next;
            place(next.cell.row, next.cell.col, next.point.x, next.point.y);
        };

        const stop = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
        if (activeTab === "buildings" && buildingsMode === "brush") {
            startPaintStroke(event, (row, col) => addPlacementAt(row, col));
        } else if (activeTab === "buildings" && buildingsMode === "erase") {
            startPaintStroke(event, (row, col, x, y) => eraseFromActiveList(x, y));
        } else if (activeTab === "decorations" && decorationsMode === "brush") {
            startPaintStroke(event, (row, col) => addPlacementAt(row, col));
        } else if (activeTab === "decorations" && decorationsMode === "terrain") {
            startPaintStroke(event, addTerrainFromPool);
        } else if (activeTab === "decorations" && decorationsMode === "erase") {
            startPaintStroke(event, (row, col, x, y) => eraseFromActiveList(x, y));
        } else if (activeTab === "scatterHouses" && houseMode === "brush") {
            startPaintStroke(event, addHouseFromPool);
        } else if (activeTab === "scatterHouses" && houseMode === "erase") {
            startPaintStroke(event, (row, col, x, y) => eraseFromActiveList(x, y));
        }
        // Every mode off: do nothing, let the event bubble to
        // MapViewport's own pan-gesture handler, unchanged from today.
    }

    // Removes every item in the active tab's own list whose rendered box
    // contains this point — scoped strictly to activeList, so erasing on
    // the Scatter Houses tab can never touch a decoration or a building,
    // and vice versa. Membership (`hitIds`) is computed from the plain
    // `layout` read here, once per call; the actual removal always goes
    // through a fresh functional setLayout update, so a redundant target
    // id (e.g. from a slightly-stale read during a fast drag) just
    // filters out nothing extra — never a correctness issue, unlike
    // deciding control flow from a value a setState updater was still in
    // the middle of computing (see awardXpForTask's own comment
    // elsewhere in this codebase for that real bug class).
    function eraseFromActiveList(x: number, y: number) {
        if (!activeList) return;
        const items = layout[activeList] as PlacedTile[];
        const hitIds = new Set(items.filter((item) => hitTestItem(item, x, y)).map((item) => item.id));
        if (hitIds.size === 0) return;

        setLayout((current) => ({
            ...current,
            [activeList]: (current[activeList] as PlacedTile[]).filter((item) => !hitIds.has(item.id)),
        }));
        if (selected && hitIds.has(selected)) setSelected(null);
    }

    // Random-pool placement for the two randomized brushes — both skip
    // any cell that already has a decoration/house/building/wall on it
    // (isCellOccupied, lib/worldLayout.ts), so an automatic fill never
    // stacks on top of anything already placed. A manual click/drag
    // afterward is unaffected (addPlacementAt never checks this), so
    // overriding by hand still works exactly as before.
    function addHouseFromPool(row: number, col: number) {
        const tile = pickRandomTile(houseBrushSlots);
        if (!tile) return;
        setLayout((current) => {
            if (isCellOccupied(current, row, col)) return current;
            const item: ScatterHouseSlot = { id: newId(), tile, row, col, scale: 2, growthThreshold: houseBrushThreshold };
            return { ...current, scatterHouses: [...current.scatterHouses, item] };
        });
    }

    function addTerrainFromPool(row: number, col: number) {
        const tile = pickRandomTile(terrainBrushSlots);
        if (!tile) return;
        setLayout((current) => {
            if (isCellOccupied(current, row, col)) return current;
            const item: PlacedTile = { id: newId(), tile, row, col, scale: 3 };
            return { ...current, decorations: [...current.decorations, item] };
        });
    }

    function assignHouseSlot(index: number) {
        setHouseBrushSlots((slots) => slots.map((slot, i) => (i === index ? brushRef : slot)));
    }

    function clearHouseSlot(index: number) {
        setHouseBrushSlots((slots) => slots.map((slot, i) => (i === index ? null : slot)));
    }

    function assignTerrainSlot(index: number) {
        setTerrainBrushSlots((slots) => slots.map((slot, i) => (i === index ? brushRef : slot)));
    }

    function clearTerrainSlot(index: number) {
        setTerrainBrushSlots((slots) => slots.map((slot, i) => (i === index ? null : slot)));
    }

    function updatePosition(list: "decorations" | "scatterHouses" | "extraBuildings", id: string, row: number, col: number) {
        setLayout((current) => ({
            ...current,
            [list]: (current[list] as PlacedTile[]).map((item) => (item.id === id ? { ...item, row, col } : item)),
        }));
    }

    function updateWallPosition(row: number, col: number) {
        setLayout((current) => (current.wall ? { ...current, wall: { ...current.wall, row, col } } : current));
    }

    function updateBuildingPosition(key: BuildingKey, row: number, col: number) {
        setLayout((current) => ({
            ...current,
            buildingPositions: { ...current.buildingPositions, [key]: { row, col } },
        }));
    }

    // Bulk-shift tool: drag the "📐 Guides" content-area handle to move
    // every positioned item (decorations/extraBuildings/scatterHouses/
    // wall/buildingPositions) together, preserving all relative
    // positions — the whole reason this exists is so a layout tuned
    // against an older, narrower margin doesn't need to be re-placed
    // tile by tile after lib/mapGrid.ts's MARGIN_COLS/ROWS change size.
    // Computed from a layout snapshot taken at gesture start (not
    // incrementally re-shifted each move) to avoid rounding drift.
    function startContentDrag(event: React.PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const start = clientToGrid(event.clientX, event.clientY, rect);
        const snapshot = layout;

        const handleMove = (moveEvent: PointerEvent) => {
            const current = clientToGrid(moveEvent.clientX, moveEvent.clientY, rect);
            const deltaRow = current.row - start.row;
            const deltaCol = current.col - start.col;
            setLayout(deltaRow === 0 && deltaCol === 0 ? snapshot : shiftLayout(snapshot, deltaRow, deltaCol));
        };

        const stop = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    // One-click version of the same idea — snaps the bounding-box center
    // of everything placed exactly to the frame's center, no dragging
    // required. This is the direct fix for "I don't want to redo all the
    // pathing I've already done."
    function centerContent() {
        const items: Array<{ row: number; col: number }> = [
            ...layout.decorations,
            ...layout.extraBuildings,
            ...layout.scatterHouses,
            ...(layout.wall ? [layout.wall] : []),
            ...BUILDING_KEYS.map((key) => layout.buildingPositions[key]),
        ];
        if (items.length === 0) return;

        const minRow = Math.min(...items.map((item) => item.row));
        const maxRow = Math.max(...items.map((item) => item.row));
        const minCol = Math.min(...items.map((item) => item.col));
        const maxCol = Math.max(...items.map((item) => item.col));

        const deltaRow = Math.round((FRAME_ROWS - 1) / 2 - (minRow + maxRow) / 2);
        const deltaCol = Math.round((FRAME_COLS - 1) / 2 - (minCol + maxCol) / 2);
        setLayout((current) => shiftLayout(current, deltaRow, deltaCol));
    }

    function startDrag(kind: "decorations" | "scatterHouses" | "extraBuildings" | "wall", id: string, event: React.PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setSelected(id);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();

        const handleMove = (moveEvent: PointerEvent) => {
            const { row, col } = clientToGrid(moveEvent.clientX, moveEvent.clientY, rect);
            if (kind === "wall") updateWallPosition(row, col);
            else updatePosition(kind, id, row, col);
        };

        const stop = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    // Used by the 5 fixed buildings — single, always-present positioned
    // items (no add/delete), just a drag-to-reposition-and-snap gesture
    // against whatever update function the caller provides.
    function startSingleDrag(onMove: (row: number, col: number) => void, selectId: string, event: React.PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setSelected(selectId);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();

        const handleMove = (moveEvent: PointerEvent) => {
            const { row, col } = clientToGrid(moveEvent.clientX, moveEvent.clientY, rect);
            onMove(row, col);
        };

        const stop = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    function deleteSelected() {
        if (!selected) return;
        if (activeList) {
            setLayout((current) => ({
                ...current,
                [activeList]: (current[activeList] as PlacedTile[]).filter((item) => item.id !== selected),
            }));
        }
        setSelected(null);
    }

    function rescaleSelected(delta: number) {
        if (!selected || !activeList) return;
        setLayout((current) => ({
            ...current,
            [activeList]: (current[activeList] as PlacedTile[]).map((item) =>
                item.id === selected ? { ...item, scale: Math.max(1, item.scale + delta) } : item
            ),
        }));
    }

    function replaceSelectedTile() {
        if (!selected || !activeList) return;
        setLayout((current) => ({
            ...current,
            [activeList]: (current[activeList] as PlacedTile[]).map((item) =>
                item.id === selected ? { ...item, tile: brushRef } : item
            ),
        }));
    }

    function setGroundSlot(slot: "baseA" | "baseB" | "tuftA" | "tuftB") {
        setLayout((current) => ({ ...current, ground: { ...current.ground, [slot]: brushRef } }));
    }

    function setBuildingStage(key: BuildingKey, stage: 0 | 1 | 2) {
        setLayout((current) => {
            const stages = [...current.buildingStageSprites[key]] as [TileRef, TileRef, TileRef];
            stages[stage] = brushRef;
            return { ...current, buildingStageSprites: { ...current.buildingStageSprites, [key]: stages } };
        });
    }

    // The drag-handle box for a fixed building needs to cover its real
    // footprint at every stage (some stage art spans multiple tiles —
    // castle_wall, town_fortress, etc.), not a guessed fixed size, or a
    // multi-tile building becomes hard to grab/see accurately.
    function buildingHandleSize(key: BuildingKey): { width: number; height: number } {
        let width = GRID_PX;
        let height = GRID_PX;
        layout.buildingStageSprites[key].forEach((ref, stage) => {
            const rect = getSpriteRect(tileRefCoord(ref), ref.sheet);
            width = Math.max(width, rect.width * STAGE_SCALE[stage]);
            height = Math.max(height, rect.height * STAGE_SCALE[stage]);
        });
        return { width, height };
    }

    async function handleSave() {
        setSaveStatus("saving");
        const ok = await saveWorldLayout(layout);
        setSaveStatus(ok ? "saved" : "error");
        if (ok) setTimeout(() => setSaveStatus("idle"), 2500);
    }

    function handleResetToDefault() {
        setLayout(DEFAULT_WORLD_LAYOUT);
        setSelected(null);
    }

    const selectedScatterHouse =
        activeTab === "scatterHouses" ? layout.scatterHouses.find((house) => house.id === selected) ?? null : null;

    const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? "";

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--app-background)" }}>
            {/* Slim top bar — kept short on purpose so the canvas below
                gets as close as possible to the real World view's actual
                available height (app/page.tsx's h-screen minus a similarly
                slim header, see WorldView.tsx). */}
            <div
                className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2"
                style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
                <div className="flex items-center gap-3">
                    <h1 className="text-base font-bold" style={{ color: "var(--heading)" }}>
                        🗺️ Map Editor
                    </h1>
                    <SmallButton onClick={() => setToolsOpen((open) => !open)} active={toolsOpen}>
                        🎨 Tools
                    </SmallButton>
                    <SmallButton onClick={() => setGuidesOn((on) => !on)} active={guidesOn}>
                        📐 Guides
                    </SmallButton>
                    <SmallButton onClick={centerContent}>🎯 Center Content</SmallButton>
                </div>
                <div className="flex items-center gap-2">
                    {saveStatus === "saved" && <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Saved!</span>}
                    {saveStatus === "error" && <span className="text-xs font-semibold text-red-400">Save failed — try again</span>}
                    <SmallButton onClick={handleResetToDefault}>Reset to Default</SmallButton>
                    <SmallButton onClick={handleSave} active>
                        {saveStatus === "saving" ? "Saving..." : "Save"}
                    </SmallButton>
                </div>
            </div>

            {/* Canvas fills all remaining viewport space. MapViewport
                (components/world/MapViewport.tsx) fits the fixed-size map
                frame to whatever space that is — the same shared behavior
                the live World view uses — so this is genuinely WYSIWYG at
                any window size, not just matched-container-dimensions.
                The tools drawer below floats OVER this rather than
                sharing layout flow with it, so opening/closing it never
                resizes the canvas or shifts the row/col mapping. */}
            <div className="relative min-h-0 flex-1">
                <MapViewport onScaleChange={({ scale, fitScale }) => setZoomScale(scale / fitScale)}>
                    <div className="pointer-events-none absolute inset-0">
                        <TownMap townState={initialTownState} layout={layout} />
                    </div>

                    {/* Grid/aspect-ratio guide — toggled via "📐 Guides".
                        Renders inside the same MapViewport frame as
                        everything else, so it pans/zooms in lockstep; the
                        dashed rectangle marks CONTENT_COLS x CONTENT_ROWS
                        (lib/mapGrid.ts) — the area DEFAULT_WORLD_LAYOUT was
                        actually tuned against — distinct from the margin
                        buffer around it. Purely visual (pointer-events-none)
                        — the actual drag handle is the small "move" badge
                        rendered after the interactive overlay below, so it
                        stacks on top and stays clickable without covering
                        the whole content area (which would block normal
                        placement/dragging underneath it). */}
                    {guidesOn && (
                        <div className="pointer-events-none absolute inset-0">
                            <div
                                className="absolute border-2 border-dashed"
                                style={{
                                    top: MARGIN_ROWS * GROUND_TILE_PX,
                                    left: MARGIN_COLS * GROUND_TILE_PX,
                                    width: CONTENT_COLS * GROUND_TILE_PX,
                                    height: CONTENT_ROWS * GROUND_TILE_PX,
                                    borderColor: "rgba(255,255,255,0.6)",
                                }}
                            />
                            <div
                                className="absolute rounded-md px-2 py-1 text-[10px] font-semibold"
                                style={{
                                    top: MARGIN_ROWS * GROUND_TILE_PX - 24,
                                    left: MARGIN_COLS * GROUND_TILE_PX,
                                    background: "rgba(0,0,0,0.6)",
                                    color: "white",
                                }}
                            >
                                Content area {CONTENT_COLS}x{CONTENT_ROWS}
                            </div>
                        </div>
                    )}

                    {/* Interactive overlay: click empty space to place, drag existing
                        handles to reposition. Sits above the (pointer-events-none)
                        live preview so editor clicks never fire TownMap's own
                        buttons (Hourglass/Bard/laptop). Also shares MapViewport's
                        pan/zoom transform, so a background drag here pans the view
                        (MapViewport suppresses the resulting click automatically)
                        while a plain tap still places a tile as before. */}
                    <div ref={canvasRef} className="absolute inset-0" onClick={handleCanvasClick} onPointerDown={handleCanvasPointerDown}>
                    {activeList &&
                        (layout[activeList] as PlacedTile[]).map((item) => {
                            const rect = getSpriteRect(tileRefCoord(item.tile), item.tile.sheet);
                            return (
                                <div
                                    key={item.id}
                                    onPointerDown={(event) => startDrag(activeList, item.id, event)}
                                    onClick={(event) => event.stopPropagation()}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-dashed active:cursor-grabbing"
                                    style={{
                                        top: item.row * GRID_PX + GRID_PX / 2,
                                        left: item.col * GRID_PX + GRID_PX / 2,
                                        width: rect.width * item.scale,
                                        height: rect.height * item.scale,
                                        borderColor: selected === item.id ? "var(--accent)" : "rgba(255,255,255,0.5)",
                                    }}
                                />
                            );
                        })}
                    {activeTab === "wall" && layout.wall && (
                        <div
                            onPointerDown={(event) => startDrag("wall", "wall", event)}
                            onClick={(event) => event.stopPropagation()}
                            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-dashed active:cursor-grabbing"
                            style={{
                                top: layout.wall.row * GRID_PX + GRID_PX / 2,
                                left: layout.wall.col * GRID_PX + GRID_PX / 2,
                                width: getSpriteRect(tileRefCoord(layout.wall.tile), layout.wall.tile.sheet).width * layout.wall.scale,
                                height: getSpriteRect(tileRefCoord(layout.wall.tile), layout.wall.tile.sheet).height * layout.wall.scale,
                                borderColor: selected === "wall" ? "var(--accent)" : "rgba(255,255,255,0.5)",
                            }}
                        />
                    )}
                    {activeTab === "buildings" &&
                        BUILDING_KEYS.map((key) => {
                            const pos = layout.buildingPositions[key];
                            const size = buildingHandleSize(key);
                            return (
                                <div
                                    key={key}
                                    onPointerDown={(event) =>
                                        startSingleDrag((row, col) => updateBuildingPosition(key, row, col), `building:${key}`, event)
                                    }
                                    onClick={(event) => event.stopPropagation()}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-dashed active:cursor-grabbing"
                                    style={{
                                        top: pos.row * GRID_PX + GRID_PX / 2,
                                        left: pos.col * GRID_PX + GRID_PX / 2,
                                        width: size.width,
                                        height: size.height,
                                        borderColor: selected === `building:${key}` ? "var(--accent)" : "rgba(255,255,255,0.5)",
                                    }}
                                />
                            );
                        })}
                    </div>

                    {/* The actual bulk-move handle for the content-area
                        guide above — a small badge, not the whole
                        rectangle, so it never covers/blocks normal
                        placement clicks elsewhere on the canvas. Rendered
                        after (so visually on top of) the interactive
                        overlay, at the content area's own center. */}
                    {guidesOn && (
                        <div
                            onPointerDown={startContentDrag}
                            title="Drag to move everything together"
                            className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-full border-2 text-base shadow-lg active:cursor-grabbing"
                            style={{
                                top: (MARGIN_ROWS + CONTENT_ROWS / 2) * GROUND_TILE_PX,
                                left: (MARGIN_COLS + CONTENT_COLS / 2) * GROUND_TILE_PX,
                                width: 36,
                                height: 36,
                                borderColor: "var(--accent)",
                                background: "var(--panel)",
                            }}
                        >
                            ✥
                        </div>
                    )}
                </MapViewport>

                {/* A small always-visible badge so the active tool stays
                    legible even with the drawer closed (closing it is the
                    whole point of being able to see the unobstructed map). */}
                <div
                    className="pointer-events-none absolute bottom-3 left-3 rounded-lg border px-2 py-1 text-[10px] font-semibold"
                    style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--muted)" }}
                >
                    Placing: {activeTabLabel}
                    {isBrushModeActive() && (
                        <>
                            {" · "}
                            {(activeTab === "decorations" && decorationsMode === "erase") ||
                            (activeTab === "buildings" && buildingsMode === "erase") ||
                            (activeTab === "scatterHouses" && houseMode === "erase")
                                ? "🧹 Eraser ON"
                                : activeTab === "decorations" && decorationsMode === "terrain"
                                  ? "🎲 Terrain Randomizer ON"
                                  : activeTab === "scatterHouses" && houseMode === "brush"
                                    ? "🎲 Random Brush ON"
                                    : "🖌 Brush ON"}
                        </>
                    )}
                    {guidesOn && (
                        <>
                            {" · "}
                            {FRAME_COLS}x{FRAME_ROWS} cells · {FRAME_COLS}:{FRAME_ROWS} ratio
                            {zoomScale !== null && ` · zoom ${Math.round(zoomScale * 100)}%`}
                        </>
                    )}
                </div>

                {/* Floating tools drawer — deliberately NOT in the canvas's
                    own layout flow (position: absolute, a sibling of the
                    canvas overlay, not a flex/grid column next to it), so
                    toggling it never resizes the canvas or shifts the
                    row/col-to-pixel mapping mid-edit. This also generalizes
                    an earlier fix: a conditionally-rendered panel that used
                    to share layout flow with the canvas caused a real
                    misclick bug (see PROGRESS.md) — now nothing in this
                    drawer can ever affect the canvas's box. */}
                {toolsOpen && (
                    <div
                        className="absolute left-3 top-3 z-30 flex w-[320px] flex-col gap-3 overflow-y-auto rounded-xl border p-3"
                        style={{
                            maxHeight: "calc(100% - 1.5rem)",
                            borderColor: "var(--border)",
                            background: "var(--app-background)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                        }}
                    >
                        <div className="flex flex-wrap gap-1.5">
                            {TABS.map((tab) => (
                                <SmallButton
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        setSelected(null);
                                        setBuildingsMode("place");
                                        setDecorationsMode("place");
                                        setHouseMode("place");
                                    }}
                                    active={activeTab === tab.id}
                                >
                                    {tab.label}
                                </SmallButton>
                            ))}
                        </div>

                        {activeTab === "ground" && (
                            <Panel title="Ground theme">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {(["baseA", "baseB", "tuftA", "tuftB"] as const).map((slot) => (
                                        <button
                                            key={slot}
                                            type="button"
                                            onClick={() => setGroundSlot(slot)}
                                            className="flex flex-col items-center gap-1 rounded-lg border p-2 transition-transform hover:scale-105"
                                            style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
                                        >
                                            <TileRefSprite tile={layout.ground[slot]} scale={2} />
                                            <span className="text-[10px] font-semibold" style={{ color: "var(--heading)" }}>
                                                {slot}
                                            </span>
                                            <span className="text-[9px]" style={{ color: "var(--muted)" }}>
                                                click to assign brush
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                <label className="mt-3 flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
                                    Tuft density: {layout.ground.tuftDensityPercent}%
                                    <input
                                        type="range"
                                        min={0}
                                        max={40}
                                        value={layout.ground.tuftDensityPercent}
                                        onChange={(event) =>
                                            setLayout((current) => ({
                                                ...current,
                                                ground: { ...current.ground, tuftDensityPercent: Number(event.target.value) },
                                            }))
                                        }
                                    />
                                </label>
                            </Panel>
                        )}

                        {activeTab === "buildings" && (
                            <Panel title="Building stage art — drag buildings on the canvas to reposition">
                                <div className="flex flex-col gap-2">
                                    {BUILDING_KEYS.map((key) => (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className="w-32 shrink-0 text-xs font-semibold" style={{ color: "var(--heading)" }}>
                                                {BUILDING_LABELS[key]}
                                            </span>
                                            {[0, 1, 2].map((stage) => (
                                                <button
                                                    key={stage}
                                                    type="button"
                                                    onClick={() => setBuildingStage(key, stage as 0 | 1 | 2)}
                                                    title={`Stage ${stage}`}
                                                    className="rounded-lg border p-1 transition-transform hover:scale-105"
                                                    style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
                                                >
                                                    <TileRefSprite tile={layout.buildingStageSprites[key][stage]} scale={2} />
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </Panel>
                        )}

                        {activeTab === "buildings" && (
                            <Panel title="Extra buildings — click the canvas to place, drag to move">
                                <p className="mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
                                    {layout.extraBuildings.length} placed. Purely decorative — not tied to any growth
                                    stat, unlike the 5 buildings above. Add as many as you like with the brush below.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    <SmallButton
                                        onClick={() => setBuildingsMode((mode) => (mode === "brush" ? "place" : "brush"))}
                                        active={buildingsMode === "brush"}
                                    >
                                        🖌 Brush {buildingsMode === "brush" ? "(drag to paint)" : ""}
                                    </SmallButton>
                                    <SmallButton
                                        onClick={() => setBuildingsMode((mode) => (mode === "erase" ? "place" : "erase"))}
                                        active={buildingsMode === "erase"}
                                    >
                                        🧹 Eraser {buildingsMode === "erase" ? "(drag to erase)" : ""}
                                    </SmallButton>
                                </div>
                            </Panel>
                        )}

                        {activeTab === "wall" && (
                            <Panel title="City wall">
                                {layout.wall ? (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <TileRefSprite tile={layout.wall.tile} scale={2} />
                                        <label className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                                            Unlocks at
                                            <select
                                                value={layout.wall.unlockStage}
                                                onChange={(event) =>
                                                    setLayout((current) =>
                                                        current.wall
                                                            ? { ...current, wall: { ...current.wall, unlockStage: event.target.value as KingdomStage } }
                                                            : current
                                                    )
                                                }
                                                className="rounded border px-1 py-0.5"
                                                style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                                            >
                                                {KINGDOM_STAGES.map((stage) => (
                                                    <option key={stage} value={stage}>{stage}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <SmallButton onClick={() => setLayout((current) => ({ ...current, wall: current.wall ? { ...current.wall, tile: brushRef } : current.wall }))}>
                                            Replace with brush
                                        </SmallButton>
                                        <SmallButton onClick={() => setLayout((current) => ({ ...current, wall: null }))}>
                                            Remove wall
                                        </SmallButton>
                                        <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                                            Drag it on the canvas to reposition.
                                        </span>
                                    </div>
                                ) : (
                                    <SmallButton onClick={() => addPlacementAt(1, 30)}>Add wall (using current brush)</SmallButton>
                                )}
                            </Panel>
                        )}

                        {activeTab === "decorations" && (
                            <Panel title="Decorations — click the canvas to place, drag to move">
                                <p className="mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
                                    {layout.decorations.length} placed. This is also where paths live — place the road
                                    sprites by hand along however route actually looks right for this pack&apos;s
                                    orthogonal junction art, rather than a computed diagonal line.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    <SmallButton
                                        onClick={() => setDecorationsMode((mode) => (mode === "brush" ? "place" : "brush"))}
                                        active={decorationsMode === "brush"}
                                    >
                                        🖌 Brush {decorationsMode === "brush" ? "(drag to paint)" : ""}
                                    </SmallButton>
                                    <SmallButton
                                        onClick={() => setDecorationsMode((mode) => (mode === "terrain" ? "place" : "terrain"))}
                                        active={decorationsMode === "terrain"}
                                    >
                                        🎲 Terrain Randomizer {decorationsMode === "terrain" ? "(drag to paint)" : ""}
                                    </SmallButton>
                                    <SmallButton
                                        onClick={() => setDecorationsMode((mode) => (mode === "erase" ? "place" : "erase"))}
                                        active={decorationsMode === "erase"}
                                    >
                                        🧹 Eraser {decorationsMode === "erase" ? "(drag to erase)" : ""}
                                    </SmallButton>
                                </div>
                            </Panel>
                        )}

                        {activeTab === "decorations" && decorationsMode === "terrain" && (
                            <Panel title="Terrain pool — pick a tile below, then click a slot to add it (up to 10)">
                                <p className="mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
                                    Dragging on the canvas fills each cell with a random tile from the filled slots
                                    below, skipping any cell that already has a decoration, house, or building on it.
                                </p>
                                <TileSlotPicker slots={terrainBrushSlots} onAssign={assignTerrainSlot} onClear={clearTerrainSlot} />
                            </Panel>
                        )}

                        {activeTab === "scatterHouses" && (
                            <Panel title="Scatter houses — click the canvas to place, drag to move">
                                <p className="mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
                                    Each one appears once the town&apos;s total growth crosses its threshold.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    <SmallButton
                                        onClick={() => setHouseMode((mode) => (mode === "brush" ? "place" : "brush"))}
                                        active={houseMode === "brush"}
                                    >
                                        🎲 Random Brush {houseMode === "brush" ? "(drag to paint)" : ""}
                                    </SmallButton>
                                    <SmallButton
                                        onClick={() => setHouseMode((mode) => (mode === "erase" ? "place" : "erase"))}
                                        active={houseMode === "erase"}
                                    >
                                        🧹 Eraser {houseMode === "erase" ? "(drag to erase)" : ""}
                                    </SmallButton>
                                </div>
                            </Panel>
                        )}

                        {activeTab === "scatterHouses" && houseMode === "brush" && (
                            <Panel title="House pool — pick a tile below, then click a slot to add it (up to 10)">
                                <p className="mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
                                    Dragging on the canvas places a randomly-chosen house from the filled slots below,
                                    skipping any cell that already has a decoration, house, or building on it.
                                </p>
                                <TileSlotPicker slots={houseBrushSlots} onAssign={assignHouseSlot} onClear={clearHouseSlot} />
                                <label className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                                    Growth threshold for new houses
                                    <input
                                        type="number"
                                        min={0}
                                        value={houseBrushThreshold}
                                        onChange={(event) => setHouseBrushThreshold(Number(event.target.value) || 0)}
                                        className="w-20 rounded border px-1 py-0.5"
                                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                                    />
                                </label>
                            </Panel>
                        )}

                        <Panel title="Sprite picker — click any tile">
                            {Object.values(SPRITE_SHEETS).length > 1 && (
                                <div className="mb-2 flex flex-wrap gap-1.5">
                                    {Object.values(SPRITE_SHEETS).map((sheet) => (
                                        <SmallButton key={sheet.id} onClick={() => switchPickerSheet(sheet.id)} active={pickerSheet === sheet.id}>
                                            {sheet.label}
                                        </SmallButton>
                                    ))}
                                </div>
                            )}
                            <div
                                className="relative overflow-y-auto rounded-lg border"
                                style={{ borderColor: "var(--border)", height: 360, imageRendering: "pixelated" }}
                            >
                                <div
                                    className="relative"
                                    style={{
                                        width: SPRITE_SHEETS[pickerSheet].columns * SPRITE_SHEETS[pickerSheet].tileSize * PICKER_SCALE,
                                        height: SPRITE_SHEETS[pickerSheet].usableRowLimit * SPRITE_SHEETS[pickerSheet].tileSize * PICKER_SCALE,
                                        backgroundImage: `url(${SPRITE_SHEETS[pickerSheet].src})`,
                                        backgroundPosition: "0 0",
                                        backgroundSize: `${SPRITE_SHEETS[pickerSheet].columns * SPRITE_SHEETS[pickerSheet].tileSize * PICKER_SCALE}px auto`,
                                        backgroundRepeat: "no-repeat",
                                        imageRendering: "pixelated",
                                    }}
                                >
                                    {Array.from({ length: SPRITE_SHEETS[pickerSheet].usableRowLimit }).map((_, rowIndex) =>
                                        Array.from({ length: SPRITE_SHEETS[pickerSheet].columns }).map((_, colIndex) => {
                                            const col = colIndex + 1;
                                            const row = rowIndex + 1;
                                            const tileSize = SPRITE_SHEETS[pickerSheet].tileSize;
                                            const isBrushOrigin = brush.sheet === pickerSheet && brush.col === col && brush.row === row;
                                            return (
                                                <button
                                                    key={`${row}-${col}`}
                                                    type="button"
                                                    onClick={() => pickCell(col, row)}
                                                    title={`col ${col}, row ${row}`}
                                                    className="absolute"
                                                    style={{
                                                        top: rowIndex * tileSize * PICKER_SCALE,
                                                        left: colIndex * tileSize * PICKER_SCALE,
                                                        width: tileSize * PICKER_SCALE,
                                                        height: tileSize * PICKER_SCALE,
                                                        border: isBrushOrigin ? "2px solid var(--accent)" : "1px solid rgba(255,255,255,0.08)",
                                                        boxSizing: "border-box",
                                                    }}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 flex items-center gap-3">
                                <TileSprite coord={brush} sheet={brush.sheet} scale={3} />
                                <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
                                    <span>{tileRefLabel(brushRef)}</span>
                                    <div className="flex items-center gap-2">
                                        <label className="flex items-center gap-1">
                                            Span right
                                            <input
                                                type="number"
                                                min={1}
                                                max={8}
                                                value={brush.colSpan}
                                                onChange={(event) =>
                                                    setBrush((current) => ({ ...current, colSpan: Math.max(1, Number(event.target.value) || 1) }))
                                                }
                                                className="w-12 rounded border px-1 py-0.5"
                                                style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                                            />
                                        </label>
                                        <label className="flex items-center gap-1">
                                            Span down
                                            <input
                                                type="number"
                                                min={1}
                                                max={8}
                                                value={brush.rowSpan}
                                                onChange={(event) =>
                                                    setBrush((current) => ({ ...current, rowSpan: Math.max(1, Number(event.target.value) || 1) }))
                                                }
                                                className="w-12 rounded border px-1 py-0.5"
                                                style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </Panel>

                        <Panel title="Quick picks (already named)">
                            <div className="grid max-h-56 grid-cols-4 gap-1 overflow-y-auto">
                                {Object.keys(SPRITE_COORDS[pickerSheet]).map((name) => (
                                    <button
                                        key={name}
                                        type="button"
                                        onClick={() => pickNamed(name)}
                                        title={name}
                                        className="flex flex-col items-center gap-0.5 rounded-lg border p-1 transition-transform hover:scale-105"
                                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
                                    >
                                        <TileSprite name={name} sheet={pickerSheet} scale={1} />
                                        <span className="w-full truncate text-center text-[8px]" style={{ color: "var(--muted)" }}>
                                            {name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </Panel>

                        {/* Selection-dependent panels live in this drawer, not
                            floating separately — the drawer itself is already
                            out of the canvas's layout flow, so nothing here
                            can shift the canvas regardless of selection state
                            (see the drawer's own comment above). */}
                        {(selectedInActiveList || (activeTab === "wall" && selected === "wall")) && (
                            <Panel title="Selected placement">
                                <div className="flex flex-wrap items-center gap-2">
                                    <SmallButton onClick={() => rescaleSelected(-1)}>Scale −</SmallButton>
                                    <SmallButton onClick={() => rescaleSelected(1)}>Scale +</SmallButton>
                                    <SmallButton onClick={replaceSelectedTile}>Replace with brush</SmallButton>
                                    <SmallButton onClick={deleteSelected}>Delete</SmallButton>
                                    {selectedScatterHouse && (
                                        <label className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                                            Growth threshold
                                            <input
                                                type="number"
                                                min={0}
                                                value={selectedScatterHouse.growthThreshold}
                                                onChange={(event) =>
                                                    setLayout((current) => ({
                                                        ...current,
                                                        scatterHouses: current.scatterHouses.map((house) =>
                                                            house.id === selected
                                                                ? { ...house, growthThreshold: Number(event.target.value) || 0 }
                                                                : house
                                                        ),
                                                    }))
                                                }
                                                className="w-20 rounded border px-1 py-0.5"
                                                style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                                            />
                                        </label>
                                    )}
                                </div>
                            </Panel>
                        )}

                        {selected?.startsWith("building:") && (() => {
                            const key = selected.slice("building:".length) as BuildingKey;
                            const pos = layout.buildingPositions[key];
                            return (
                                <Panel title="Selected building">
                                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                                        {BUILDING_LABELS[key]} — row {pos.row}, col {pos.col}. Drag it on the canvas to
                                        reposition; it snaps to the same grid the paths do.
                                    </p>
                                </Panel>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}
