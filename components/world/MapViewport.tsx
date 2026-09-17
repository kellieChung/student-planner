"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FRAME_WIDTH_PX, FRAME_HEIGHT_PX, CONTENT_COLS, CONTENT_ROWS, GROUND_TILE_PX } from "@/lib/mapGrid";

const CONTENT_WIDTH_PX = CONTENT_COLS * GROUND_TILE_PX;
const CONTENT_HEIGHT_PX = CONTENT_ROWS * GROUND_TILE_PX;

type Props = {
    children: React.ReactNode;
    // Optional — lets a caller (the map editor's grid/aspect-ratio guide)
    // read the live zoom level without this component needing to know
    // anything about that UI. `fitScale` is included alongside the raw
    // CSS `scale` so the caller can report zoom *relative to fit*
    // (scale/fitScale), which is what "100%" should mean to a user, not
    // the raw transform value. Not used by WorldView.tsx.
    onScaleChange?: (info: { scale: number; fitScale: number }) => void;
};

type Transform = { scale: number; tx: number; ty: number };

// Relative to zoomFloor (below) — never below 1, so no matter how far
// the user zooms out from the (tighter) content-area default, the floor
// is still exactly the point where the frame *covers* the container
// (CSS background-size: cover, not contain) on every side. Below that
// would either reveal the container's own dark background (contain-
// style slack) or the grid's true edge, neither of which should ever be
// reachable.
const MIN_ZOOM_MULT = 1;
// Relative to contentFit (below) — zooming in for detail work is
// measured against the tighter, content-area baseline, not the looser
// full-grid one.
const MAX_ZOOM_MULT = 4;
// A real click/tap almost always has a few px of incidental movement
// between down and up — too tight a threshold here misreads an ordinary
// click as a pan-drag and (via suppressNextClick below) swallows the
// click that should have landed on a button or placed a tile.
const DRAG_THRESHOLD_PX = 10;
const WHEEL_ZOOM_SPEED = 0.0015;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

// Fits `targetWidth x targetHeight` (a region of the frame) into the
// container, but always centers relative to the *full* FRAME_WIDTH_PX x
// FRAME_HEIGHT_PX — correct for both the content area and the full
// frame as targets, since the content area is symmetrically centered
// inside the frame by construction (MARGIN_COLS/ROWS is identical on
// every side), so its own center always coincides with the frame's.
// `mode: "cover"` (like CSS background-size: cover, vs the default
// "contain") picks the scale that fills the container on BOTH axes,
// cropping whichever axis has slack instead of leaving it empty — used
// only for the zoom-out floor, so that floor never letterboxes.
function transformFor(
    width: number,
    height: number,
    targetWidth: number,
    targetHeight: number,
    mode: "contain" | "cover" = "contain"
): Transform {
    const scale = mode === "cover" ? Math.max(width / targetWidth, height / targetHeight) : Math.min(width / targetWidth, height / targetHeight);
    return {
        scale,
        tx: (width - FRAME_WIDTH_PX * scale) / 2,
        ty: (height - FRAME_HEIGHT_PX * scale) / 2,
    };
}

// The pixel art itself is the hard boundary — no slack. On an axis where
// the frame is smaller than the container (only possible on the
// non-constrained axis at exactly "fit", since MIN_ZOOM_MULT already
// forbids zooming out any further), that axis is locked to its exact
// centered offset — no drag freedom, since any other position would
// necessarily show the dark background past the grid's real edge on
// that side. Once the frame is larger than the container (zoomed in),
// it clamps to the standard "content can't recede past the container
// edge" range, so dragging always keeps the frame covering the
// container completely.
function clampPan(next: Transform, containerWidth: number, containerHeight: number): Transform {
    const contentWidth = FRAME_WIDTH_PX * next.scale;
    const contentHeight = FRAME_HEIGHT_PX * next.scale;

    const tx =
        contentWidth <= containerWidth ? (containerWidth - contentWidth) / 2 : clamp(next.tx, containerWidth - contentWidth, 0);
    const ty =
        contentHeight <= containerHeight ? (containerHeight - contentHeight) / 2 : clamp(next.ty, containerHeight - contentHeight, 0);

    return { scale: next.scale, tx, ty };
}

// Suppresses the single `click` event that follows a real drag gesture —
// installed only when a gesture actually crossed DRAG_THRESHOLD_PX, so a
// plain tap (place a tile in the editor; press a button on the live
// view) still reaches its normal onClick handler undisturbed. Capture
// phase, so it intercepts before the event reaches any descendant
// (canvasRef's own onClick in the map editor included).
function suppressNextClick(el: HTMLElement) {
    const handler = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
    };
    el.addEventListener("click", handler, { capture: true, once: true });
}

type Gesture =
    | { kind: "pan"; pointerId: number; startClientX: number; startClientY: number; startTransform: Transform; moved: boolean }
    | { kind: "pinch"; startDist: number; startMidX: number; startMidY: number; startTransform: Transform };

// Shared pan/zoom/fit viewport for the World map — used identically by
// the live "View Kingdom" screen (WorldView.tsx) and the map editor
// (MapEditor.tsx), so both always behave the same way and stay visually
// consistent. Wraps fixed-size children (the FRAME_WIDTH_PX x
// FRAME_HEIGHT_PX map content) and scales/positions them to fit whatever
// container it's given — this, not the old oversized-grid-clipped-by-
// overflow-hidden approach, is what makes the map "get smaller on
// smaller screens" instead of just showing less of it. On top of that
// baseline fit, real interaction is supported: mouse wheel zooms toward
// the cursor, dragging empty background pans, and two simultaneous
// Pointer Events (mouse/touch/pen are already unified by the Pointer
// Events API, so this covers touch pinch-to-zoom with no separate touch
// listeners) drive pinch-zoom-and-pan together.
//
// Existing placement-handle drags (components/dev/MapEditor.tsx) and
// TownMap's own buttons need no changes to coexist with this: a
// pointerdown that never reaches this component's own handler (because
// a descendant already called stopPropagation, as every placement
// handle already does) simply never starts a pan gesture here — the
// descendant's own drag logic runs exactly as before. A pointerdown that
// does reach here but turns out to be a plain tap (moved less than
// DRAG_THRESHOLD_PX) never pans and never suppresses anything, so a
// button's native click or the editor's click-to-place both work
// normally.
export default function MapViewport({ children, onScaleChange }: Props) {
    const outerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
    const [transform, setTransform] = useState<Transform | null>(null);
    const hasInteractedRef = useRef(false);

    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const gestureRef = useRef<Gesture | null>(null);
    // The window-level pointermove/pointerup listeners below are created
    // once per gesture (not re-created every render), so they can't rely
    // on closing over the `transform` state variable for anything beyond
    // gesture start — this ref is what they read for "the current
    // transform" mid-gesture (e.g. handing off a 2-finger pinch to a
    // 1-finger pan without snapping).
    const transformRef = useRef<Transform | null>(null);
    useEffect(() => {
        transformRef.current = transform;
    }, [transform]);

    useEffect(() => {
        const el = outerRef.current;
        if (!el) return;

        // clientWidth/clientHeight (layout-box size), not
        // getBoundingClientRect() (visually-rendered box after all
        // transforms) — real bug, found live: WorldView mounts this
        // component at the exact instant LaptopFrame's lid-opening 3D
        // animation starts (app/globals.css's lid-open keyframe,
        // rotateX(-100deg) → rotateX(0deg) under perspective:1600px), so
        // a getBoundingClientRect() read at mount time could catch the
        // element mid-rotation and report a wildly distorted size,
        // permanently poisoning "fit" for that mount (ResizeObserver
        // never re-fires afterward, since the element's actual layout
        // box never changes — only its rotation does). clientWidth/Height
        // are pure layout-box dimensions, unaffected by transform/
        // perspective on the element or any ancestor at any point during
        // an animation.
        const measure = () => {
            setContainerSize({ width: el.clientWidth, height: el.clientHeight });
        };

        measure();

        // ResizeObserver is the primary signal (catches layout changes that
        // aren't a window resize at all), but its callback rides the same
        // rendering-pipeline scheduling that browsers can throttle for a
        // backgrounded/inactive tab — a plain window "resize" listener
        // (falling back to the same measurement) is cheap, standard-primitive
        // insurance against that, since it's what actually matters for the
        // concrete case this component exists for (a real screen-size
        // change).
        let observer: ResizeObserver | undefined;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(measure);
            observer.observe(el);
        }
        window.addEventListener("resize", measure);

        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);

    // Two distinct targets: `contentFit` (tighter — just
    // CONTENT_COLS x CONTENT_ROWS, the area the map editor's "📐 Guides"
    // overlay marks) is what "Fit"/the initial view actually shows;
    // `zoomFloor` is the absolute zoom-out floor, never rendered
    // directly. It deliberately uses "cover" (not "contain") of the full
    // FRAME_COLS x FRAME_ROWS grid — a "contain" floor leaves slack on
    // whichever axis doesn't match the container's aspect ratio, which
    // renders as the container's own dark background (a real bug found
    // live: "the user can still zoom out to see past the map"). "cover"
    // guarantees the frame always fills the container completely, so
    // that background is structurally unreachable; any slack instead
    // crops into the frame's own grass margin, never past its edge.
    const contentFit = useMemo(() => {
        if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return null;
        return transformFor(containerSize.width, containerSize.height, CONTENT_WIDTH_PX, CONTENT_HEIGHT_PX);
    }, [containerSize]);

    const zoomFloor = useMemo(() => {
        if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return null;
        return transformFor(containerSize.width, containerSize.height, FRAME_WIDTH_PX, FRAME_HEIGHT_PX, "cover");
    }, [containerSize]);

    useEffect(() => {
        if (transform && contentFit) onScaleChange?.({ scale: transform.scale, fitScale: contentFit.scale });
    }, [transform, contentFit, onScaleChange]);

    // Track the container's fit automatically until the user actually
    // interacts (zoom/pan) — after that, a resize shouldn't yank their
    // view back; only the explicit Fit button does that again.
    useEffect(() => {
        if (contentFit && !hasInteractedRef.current) {
            setTransform(contentFit);
        }
    }, [contentFit]);

    function resetToFit() {
        if (!contentFit) return;
        hasInteractedRef.current = false;
        setTransform(contentFit);
    }

    function zoomAt(clientX: number, clientY: number, factor: number) {
        const rect = outerRef.current?.getBoundingClientRect();
        if (!rect || !zoomFloor || !contentFit) return;

        setTransform((current) => {
            if (!current) return current;
            hasInteractedRef.current = true;

            const minScale = Math.min(zoomFloor.scale, contentFit.scale) * MIN_ZOOM_MULT;
            const maxScale = contentFit.scale * MAX_ZOOM_MULT;
            const nextScale = clamp(current.scale * factor, minScale, maxScale);

            const cx = clientX - rect.left;
            const cy = clientY - rect.top;
            const logicalX = (cx - current.tx) / current.scale;
            const logicalY = (cy - current.ty) / current.scale;

            return clampPan({ scale: nextScale, tx: cx - logicalX * nextScale, ty: cy - logicalY * nextScale }, rect.width, rect.height);
        });
    }

    function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
        zoomAt(event.clientX, event.clientY, factor);
    }

    function attachWindowListeners() {
        const handleMove = (event: PointerEvent) => {
            if (!pointersRef.current.has(event.pointerId)) return;
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

            const rect = outerRef.current?.getBoundingClientRect();
            const gesture = gestureRef.current;
            if (!rect || !gesture) return;

            if (gesture.kind === "pan") {
                if (event.pointerId !== gesture.pointerId) return;
                const dx = event.clientX - gesture.startClientX;
                const dy = event.clientY - gesture.startClientY;
                if (!gesture.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) gesture.moved = true;
                if (!gesture.moved) return;

                hasInteractedRef.current = true;
                event.preventDefault();
                setTransform(
                    clampPan(
                        { scale: gesture.startTransform.scale, tx: gesture.startTransform.tx + dx, ty: gesture.startTransform.ty + dy },
                        rect.width,
                        rect.height
                    )
                );
            } else {
                const points = Array.from(pointersRef.current.values());
                if (points.length < 2 || !zoomFloor || !contentFit) return;
                event.preventDefault();

                const [p1, p2] = points;
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;

                hasInteractedRef.current = true;
                const minScale = Math.min(zoomFloor.scale, contentFit.scale) * MIN_ZOOM_MULT;
                const maxScale = contentFit.scale * MAX_ZOOM_MULT;
                const nextScale = clamp(gesture.startTransform.scale * (dist / gesture.startDist), minScale, maxScale);

                const anchorX = gesture.startMidX - rect.left;
                const anchorY = gesture.startMidY - rect.top;
                const logicalX = (anchorX - gesture.startTransform.tx) / gesture.startTransform.scale;
                const logicalY = (anchorY - gesture.startTransform.ty) / gesture.startTransform.scale;
                const cx = midX - rect.left;
                const cy = midY - rect.top;

                setTransform(clampPan({ scale: nextScale, tx: cx - logicalX * nextScale, ty: cy - logicalY * nextScale }, rect.width, rect.height));
            }
        };

        const handleUp = (event: PointerEvent) => {
            pointersRef.current.delete(event.pointerId);

            const gesture = gestureRef.current;
            if (gesture?.kind === "pan" && gesture.moved && gesture.pointerId === event.pointerId && outerRef.current) {
                suppressNextClick(outerRef.current);
            }

            if (pointersRef.current.size === 0) {
                gestureRef.current = null;
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
                window.removeEventListener("pointercancel", handleUp);
                return;
            }

            // Dropped from 2 fingers to 1 mid-pinch — hand off to a fresh
            // pan gesture from the remaining pointer's current position
            // rather than snapping. `moved` starts false (not true): if
            // the user then simply lifts that last finger too, with no
            // further movement, this handed-off gesture must NOT read as
            // "a pan that moved and just ended here" — that was a real
            // bug (found live): it installed a stray click-suppressor
            // that swallowed the very next click anywhere on the map,
            // including a legitimate Fit-button press, after every
            // ordinary two-finger pinch. Real continued movement past
            // the threshold still correctly promotes this to a genuine
            // pan via the normal handleMove logic below.
            if (pointersRef.current.size === 1 && transformRef.current) {
                const [[pointerId, point]] = pointersRef.current;
                gestureRef.current = {
                    kind: "pan",
                    pointerId,
                    startClientX: point.x,
                    startClientY: point.y,
                    startTransform: transformRef.current,
                    moved: false,
                };
            }
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        window.addEventListener("pointercancel", handleUp);
    }

    function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 && event.pointerType === "mouse") return;

        const wasEmpty = pointersRef.current.size === 0;
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointersRef.current.size === 1) {
            gestureRef.current = {
                kind: "pan",
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startTransform: transform ?? contentFit ?? { scale: 1, tx: 0, ty: 0 },
                moved: false,
            };
        } else if (pointersRef.current.size === 2) {
            const startTransform = transform ?? contentFit;
            if (startTransform) {
                const points = Array.from(pointersRef.current.values());
                const [p1, p2] = points;
                gestureRef.current = {
                    kind: "pinch",
                    startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
                    startMidX: (p1.x + p2.x) / 2,
                    startMidY: (p1.y + p2.y) / 2,
                    startTransform,
                };
            }
        }

        if (wasEmpty) attachWindowListeners();
    }

    const ready = transform !== null;

    return (
        <div
            ref={outerRef}
            className="relative h-full min-h-[320px] w-full overflow-hidden touch-none"
            style={{ backgroundColor: "#1f4530" }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
        >
            {ready && (
                <div
                    className="absolute left-0 top-0"
                    style={{
                        width: FRAME_WIDTH_PX,
                        height: FRAME_HEIGHT_PX,
                        transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
                        transformOrigin: "0 0",
                    }}
                >
                    {children}
                </div>
            )}

            <button
                type="button"
                onClick={resetToFit}
                onPointerDown={(event) => event.stopPropagation()}
                className="absolute bottom-3 right-3 z-10 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-transform hover:scale-105"
                style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
            >
                ⤢ Fit
            </button>
        </div>
    );
}
