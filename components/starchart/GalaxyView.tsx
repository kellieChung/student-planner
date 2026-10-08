"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useStarChart } from "@/components/starchart/StarChartContext";
import { chartedIndexes, CONSTELLATIONS, Constellation, isComplete, isVisible } from "@/lib/constellations";

type Props = {
    onChartTab: () => void;
};

// World units: 10 per degree. Equirectangular RA/Dec, RA increasing to the
// left like a real sky map. Horizontal panning wraps, so the 0h/24h seam
// never splits Pegasus from Andromeda.
const UNITS_PER_DEGREE = 10;
const WORLD_W = 360 * UNITS_PER_DEGREE;
const WORLD_H = 180 * UNITS_PER_DEGREE;
const RADIUS_BY_MAG = { 1: 3.2, 2: 2.5, 3: 1.9 } as const;
const MAX_TWINKLES = 24;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 10;
// Names show from this zoom (relative to the fitted view) to keep it calm.
const LABEL_ZOOM = 1.8;

type View = { k: number; tx: number; ty: number };

function worldPosition(constellation: Constellation) {
    return {
        x: ((24 - constellation.ra) / 24) * WORLD_W,
        y: ((90 - constellation.dec) / 180) * WORLD_H,
        size: constellation.span * UNITS_PER_DEGREE,
    };
}

function wrap(value: number, period: number) {
    return ((value % period) + period) % period;
}

export default function GalaxyView({ onChartTab }: Props) {
    const { state } = useStarChart();
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [view, setView] = useState<View | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [paused, setPaused] = useState(false);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ moved: number; lastDistance: number | null }>({ moved: 0, lastDistance: null });
    // The map (and so containerRef) only mounts once something is charted.
    const hasCharted = state.charted.length > 0;

    const visible = useMemo(
        () => CONSTELLATIONS.filter((constellation) =>
            isVisible(constellation, state.lifetimeStarlight, state.charted, state.unlockedRegions)
        ),
        [state.lifetimeStarlight, state.charted, state.unlockedRegions]
    );

    // A deterministic, capped set of twinkling stars (the first charted ones).
    const twinkles = useMemo(
        () => new Set(state.charted.slice(0, MAX_TWINKLES).map((star) => `${star.constellationId}:${star.starIndex}`)),
        [state.charted]
    );

    const fitK = size.height > 0 ? size.height / (WORLD_H * 0.75) : 1;

    // Centre on the charted sky (circular mean of RA, so it handles the seam).
    const homeView = useCallback((): View => {
        const started = visible.filter((constellation) => chartedIndexes(constellation.id, state.charted).size > 0);
        const focus = started.length > 0 ? started : visible;
        let sin = 0;
        let cos = 0;
        let dec = 0;
        for (const constellation of focus) {
            const angle = (constellation.ra / 24) * Math.PI * 2;
            sin += Math.sin(angle);
            cos += Math.cos(angle);
            dec += constellation.dec;
        }
        const ra = focus.length > 0 ? wrap((Math.atan2(sin, cos) / (Math.PI * 2)) * 24, 24) : 6;
        const center = { x: ((24 - ra) / 24) * WORLD_W, y: ((90 - (focus.length > 0 ? dec / focus.length : 20)) / 180) * WORLD_H };
        const k = fitK * 1.4;

        return { k, tx: size.width / 2 - center.x * k, ty: size.height / 2 - center.y * k };
    }, [visible, state.charted, fitK, size.width, size.height]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const observer = new ResizeObserver(([entry]) => {
            setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [hasCharted]);

    useEffect(() => {
        const update = () => setPaused(document.hidden);
        document.addEventListener("visibilitychange", update);
        return () => document.removeEventListener("visibilitychange", update);
    }, []);

    const current = view ?? (size.width > 0 ? homeView() : null);

    const clampView = useCallback((next: View): View => {
        const k = Math.min(Math.max(next.k, fitK * MIN_ZOOM), fitK * MAX_ZOOM);
        const worldHeight = WORLD_H * k;
        const margin = size.height * 0.4;
        const ty = Math.min(Math.max(next.ty, size.height - worldHeight - margin), margin);
        return { k, tx: next.tx, ty };
    }, [fitK, size.height]);

    const zoomAt = useCallback((factor: number, originX: number, originY: number) => {
        if (!current) return;
        const k = Math.min(Math.max(current.k * factor, fitK * MIN_ZOOM), fitK * MAX_ZOOM);
        const ratio = k / current.k;
        setView(clampView({ k, tx: originX - (originX - current.tx) * ratio, ty: originY - (originY - current.ty) * ratio }));
    }, [current, fitK, clampView]);

    // React's onWheel is passive, so the page would scroll too; a native
    // non-passive listener (reading the latest zoomAt through a ref) can stop it.
    const zoomAtRef = useRef(zoomAt);
    useEffect(() => {
        zoomAtRef.current = zoomAt;
    }, [zoomAt]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const onWheel = (event: globalThis.WheelEvent) => {
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            zoomAtRef.current(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
        };
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [hasCharted]);

    function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 1) gesture.current = { moved: 0, lastDistance: null };
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
        const previous = pointers.current.get(event.pointerId);
        if (!previous || !current) return;

        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            const rect = event.currentTarget.getBoundingClientRect();
            if (gesture.current.lastDistance) {
                zoomAt(distance / gesture.current.lastDistance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
            }
            gesture.current.lastDistance = distance;
            gesture.current.moved += 10;
            return;
        }

        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        gesture.current.moved += Math.abs(dx) + Math.abs(dy);
        setView(clampView({ k: current.k, tx: current.tx + dx, ty: current.ty + dy }));
    }

    function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
        pointers.current.delete(event.pointerId);
        gesture.current.lastDistance = null;
    }

    function handleViewKey(event: KeyboardEvent<HTMLDivElement>) {
        if (!current || event.target !== event.currentTarget) return;
        const step = 60;
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
        };
        if (moves[event.key]) {
            event.preventDefault();
            const [dx, dy] = moves[event.key];
            setView(clampView({ k: current.k, tx: current.tx + dx, ty: current.ty + dy }));
        } else if (event.key === "+" || event.key === "=") {
            zoomAt(1.25, size.width / 2, size.height / 2);
        } else if (event.key === "-") {
            zoomAt(1 / 1.25, size.width / 2, size.height / 2);
        }
    }

    const selected = selectedId ? visible.find((constellation) => constellation.id === selectedId) ?? null : null;

    if (!hasCharted) {
        return (
            <div className="mt-6 flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--ls-line)] p-6 text-center" role="tabpanel" aria-labelledby="star-chart-tab-galaxy">
                <p className="font-[family-name:var(--font-spectral)] text-2xl">Chart your first star to begin your galaxy</p>
                <p className="mt-2 max-w-sm text-sm text-[var(--ls-muted)]">
                    Every star you chart lights up here, in its real place in the sky.
                </p>
                <button
                    type="button"
                    onClick={onChartTab}
                    className="mt-4 rounded-full bg-[var(--ls-gold)] px-5 py-2 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)]"
                >
                    Go to the Chart
                </button>
            </div>
        );
    }

    const showLabels = current ? current.k >= fitK * LABEL_ZOOM : false;
    const centerWorldX = current ? (size.width / 2 - current.tx) / current.k : 0;

    return (
        <div className="mt-6" role="tabpanel" aria-labelledby="star-chart-tab-galaxy">
            <p className="mb-3 text-sm text-[var(--ls-muted)]">
                Drag to explore, scroll or pinch to zoom. Select a constellation for details.
            </p>
            <div className="relative">
                <div
                    ref={containerRef}
                    className="ls-galaxy relative h-[65vh] min-h-[380px] touch-none select-none overflow-hidden rounded-3xl border border-[var(--ls-line)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)]"
                    data-paused={paused}
                    tabIndex={0}
                    aria-label="Galaxy map. Arrow keys pan, plus and minus zoom. Tab to move between constellations."
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onKeyDown={handleViewKey}
                    style={{ cursor: "grab" }}
                >
                    {current && (
                        <svg width={size.width} height={size.height} className="block" aria-hidden={false}>
                            <g transform={`translate(${current.tx} ${current.ty}) scale(${current.k})`}>
                                <Graticule centerWorldX={centerWorldX} />
                                {visible.map((constellation) => {
                                    const position = worldPosition(constellation);
                                    // Draw each constellation in whichever wrapped copy of
                                    // the sky is nearest the middle of the view.
                                    const offset = Math.round((centerWorldX - position.x) / WORLD_W) * WORLD_W;

                                    return (
                                        <GalaxyNode
                                            key={constellation.id}
                                            constellation={constellation}
                                            x={position.x + offset}
                                            y={position.y}
                                            size={position.size}
                                            scale={current.k}
                                            showLabel={showLabels || selectedId === constellation.id}
                                            twinkles={twinkles}
                                            onOpen={() => {
                                                if (gesture.current.moved > 6) return;
                                                setSelectedId(constellation.id);
                                            }}
                                        />
                                    );
                                })}
                            </g>
                        </svg>
                    )}
                </div>

                <div className="absolute right-3 top-3 flex flex-col gap-1.5">
                    <MapButton label="Zoom in" onClick={() => zoomAt(1.4, size.width / 2, size.height / 2)}>+</MapButton>
                    <MapButton label="Zoom out" onClick={() => zoomAt(1 / 1.4, size.width / 2, size.height / 2)}>−</MapButton>
                    <MapButton label="Reset view" onClick={() => setView(null)}>⟲</MapButton>
                </div>

                {selected && <GalaxyDetail constellation={selected} onClose={() => setSelectedId(null)} onChartTab={onChartTab} />}
            </div>

            <ul className="sr-only" aria-label="Constellations in your galaxy">
                {visible.map((constellation) => (
                    <li key={constellation.id}>
                        {constellation.name}: {chartedIndexes(constellation.id, state.charted).size} of {constellation.stars.length} stars charted
                    </li>
                ))}
            </ul>
        </div>
    );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ls-line)] bg-[var(--ls-navy-raised)] text-lg text-[var(--ls-ivory)] transition-colors hover:border-[var(--ls-gold)] focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)]"
        >
            <span aria-hidden="true">{children}</span>
        </button>
    );
}

// Faint RA/Dec lines for a sense of place; drawn around the view's centre so
// they follow the wrap.
function Graticule({ centerWorldX }: { centerWorldX: number }) {
    const start = Math.floor((centerWorldX - WORLD_W) / (30 * UNITS_PER_DEGREE)) * 30 * UNITS_PER_DEGREE;
    const meridians = Array.from({ length: 25 }, (_, index) => start + index * 30 * UNITS_PER_DEGREE);
    const parallels = [-60, -30, 0, 30, 60].map((dec) => ((90 - dec) / 180) * WORLD_H);

    return (
        <g stroke="var(--ls-muted)" strokeOpacity={0.12} vectorEffect="non-scaling-stroke">
            {meridians.map((x) => (
                <line key={`m${x}`} x1={x} y1={0} x2={x} y2={WORLD_H} vectorEffect="non-scaling-stroke" />
            ))}
            {parallels.map((y) => (
                <line
                    key={`p${y}`}
                    x1={start}
                    y1={y}
                    x2={start + 2 * WORLD_W}
                    y2={y}
                    strokeOpacity={y === WORLD_H / 2 ? 0.22 : 0.12}
                    vectorEffect="non-scaling-stroke"
                />
            ))}
        </g>
    );
}

type NodeProps = {
    constellation: Constellation;
    x: number;
    y: number;
    size: number;
    scale: number;
    showLabel: boolean;
    twinkles: Set<string>;
    onOpen: () => void;
};

function GalaxyNode({ constellation, x, y, size, scale, showLabel, twinkles, onOpen }: NodeProps) {
    const { state } = useStarChart();
    const charted = chartedIndexes(constellation.id, state.charted);
    const unit = size / 100;
    const point = (index: number) => ({
        x: x - size / 2 + constellation.stars[index].x * unit,
        y: y - size / 2 + constellation.stars[index].y * unit,
    });
    // Stars keep a readable on-screen size at any zoom.
    const starScale = Math.max(unit, 1.6 / scale);

    return (
        <g
            className={`ls-galaxy-node ${charted.size === 0 ? "ls-galaxy-outline" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={`${constellation.name}, ${charted.size} of ${constellation.stars.length} charted`}
            onClick={onOpen}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen();
                }
            }}
            style={{ cursor: "pointer" }}
        >
            <circle cx={x} cy={y} r={size * 0.6} fill="transparent" className="ls-galaxy-focus" stroke="none" opacity={0} vectorEffect="non-scaling-stroke" />
            {constellation.edges.map(([from, to]) => {
                const a = point(from);
                const b = point(to);
                const lit = charted.has(from) && charted.has(to);
                return (
                    <line
                        key={`${from}-${to}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        className={lit ? "ls-edge-lit" : "ls-edge-dim"}
                        vectorEffect="non-scaling-stroke"
                    />
                );
            })}
            {constellation.stars.map((star, index) => {
                const { x: cx, y: cy } = point(index);
                const radius = RADIUS_BY_MAG[star.mag] * starScale;
                return charted.has(index) ? (
                    <g key={index}>
                        <circle cx={cx} cy={cy} r={radius * 2.6} className="ls-map-halo" />
                        <circle
                            cx={cx}
                            cy={cy}
                            r={radius}
                            className={`ls-star-lit ${twinkles.has(`${constellation.id}:${index}`) ? "ls-twinkle" : ""}`}
                            style={{ animationDelay: `${(index * 0.7) % 5}s`, animationDuration: "6s" }}
                        />
                    </g>
                ) : (
                    <circle key={index} cx={cx} cy={cy} r={radius * 0.8} className="ls-map-unlit" vectorEffect="non-scaling-stroke" />
                );
            })}
            {showLabel && (
                <text
                    x={x}
                    y={y + size / 2 + 14 / scale}
                    textAnchor="middle"
                    fontSize={12 / scale}
                    fill="var(--ls-ivory)"
                    opacity={charted.size === 0 ? 0.6 : 0.9}
                    className="font-[family-name:var(--font-spectral)]"
                >
                    {constellation.name}
                </text>
            )}
        </g>
    );
}

function GalaxyDetail({ constellation, onClose, onChartTab }: { constellation: Constellation; onClose: () => void; onChartTab: () => void }) {
    const { state } = useStarChart();
    const charted = chartedIndexes(constellation.id, state.charted);
    const complete = isComplete(constellation, state.charted);
    const firstCharted = state.charted
        .filter((star) => star.constellationId === constellation.id && star.chartedAt)
        .map((star) => star.chartedAt as string)
        .sort()[0];

    return (
        <div
            role="dialog"
            aria-label={`${constellation.name} details`}
            className="absolute bottom-3 left-3 right-3 rounded-2xl border border-[var(--ls-line)] bg-[var(--ls-night)] p-4 shadow-2xl sm:right-auto sm:w-80"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-[family-name:var(--font-spectral)] text-xl">{constellation.name}</p>
                    {constellation.commonName && <p className="text-xs text-[var(--ls-muted)]">{constellation.commonName}</p>}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    autoFocus
                    className="rounded-lg border border-[var(--ls-line)] px-2.5 py-1 text-xs font-semibold text-[var(--ls-muted)] hover:text-[var(--ls-ivory)] focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)]"
                >
                    Close
                </button>
            </div>
            <p className="mt-2 text-sm">
                {charted.size} of {constellation.stars.length} charted
            </p>
            {firstCharted && (
                <p className="text-xs text-[var(--ls-muted)]">
                    First star charted {new Date(firstCharted).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
            )}
            <p className="mt-2 text-sm text-[var(--ls-muted)]">
                {complete ? (
                    <>
                        <span className="ls-eyebrow mr-2 text-[var(--ls-gold)]">Field note</span>
                        <span className="text-[var(--ls-ivory)]">{constellation.fact}</span>
                    </>
                ) : (
                    "Fully chart it to reveal its field note."
                )}
            </p>
            {!complete && (
                <button
                    type="button"
                    onClick={onChartTab}
                    className="mt-3 rounded-full border border-[var(--ls-line)] px-4 py-1.5 text-xs font-semibold hover:border-[var(--ls-gold)]"
                >
                    Chart its stars
                </button>
            )}
        </div>
    );
}
