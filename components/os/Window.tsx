"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useWindowManager, type WindowAppId } from "./WindowManagerContext";

type Props = {
    app: WindowAppId;
    title: string;
    icon: React.ReactNode;
    children: ReactNode;
    // Called right before closeWindow fires — for apps where "closed"
    // needs to mean more than "the window disappears" (Pomodoro: closing
    // should actually pause the countdown, not leave it silently ticking
    // in the background while the window is gone — unlike Music, where
    // unmounting the player already stops the audio for free).
    onBeforeClose?: () => void;
    // Return true to keep the window open (e.g. to ask for confirmation
    // first; the caller then closes it itself).
    interceptClose?: () => boolean;
};

// Generic draggable, resizable OS window chrome: a title bar (drag handle +
// minimize/close buttons) plus a bottom-right resize grip around arbitrary
// content. Dragging/resizing/position/size/z-order all live in
// WindowManagerContext, shared with the taskbar and the World's themed
// panels.
export default function Window({ app, title, icon, children, onBeforeClose, interceptClose }: Props) {
    const { windows, moveWindow, resizeWindow, minimizeWindow, closeWindow, focusWindow } = useWindowManager();
    const meta = windows[app];

    // Each drag/resize gesture builds its own pair of move/up handlers
    // (closing over that gesture's own start position) instead of stable
    // cross-render callbacks — simpler than fighting for referential
    // stability across renders, and there's no cross-render state to keep
    // in sync since each gesture is independent. stopDragRef/stopResizeRef
    // hold whichever pair is currently active so an unmount mid-gesture can
    // still clean up.
    const stopDragRef = useRef<(() => void) | null>(null);
    const stopResizeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => {
            stopDragRef.current?.();
            stopResizeRef.current?.();
        };
    }, []);

    const startDragging = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();

        focusWindow(app);

        const startX = event.clientX;
        const startY = event.clientY;
        const originX = meta.position.x;
        const originY = meta.position.y;

        const handleMove = (moveEvent: PointerEvent) => {
            moveWindow(app, {
                x: Math.max(0, originX + (moveEvent.clientX - startX)),
                y: Math.max(0, originY + (moveEvent.clientY - startY)),
            });
        };

        const stopDragging = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", stopDragging);
            window.removeEventListener("pointercancel", stopDragging);
            stopDragRef.current = null;
        };

        stopDragRef.current = stopDragging;
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", stopDragging);
        window.addEventListener("pointercancel", stopDragging);
    };

    const startResizing = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        focusWindow(app);

        const startX = event.clientX;
        const startY = event.clientY;
        const originWidth = meta.size.width;
        const originHeight = meta.size.height;

        const handleResizeMove = (moveEvent: PointerEvent) => {
            resizeWindow(app, {
                width: originWidth + (moveEvent.clientX - startX),
                height: originHeight + (moveEvent.clientY - startY),
            });
        };

        const stopResizing = () => {
            window.removeEventListener("pointermove", handleResizeMove);
            window.removeEventListener("pointerup", stopResizing);
            window.removeEventListener("pointercancel", stopResizing);
            stopResizeRef.current = null;
        };

        stopResizeRef.current = stopResizing;
        window.addEventListener("pointermove", handleResizeMove);
        window.addEventListener("pointerup", stopResizing);
        window.addEventListener("pointercancel", stopResizing);
    };

    if (!meta.isOpen) return null;

    return (
        <div
            className={`pointer-events-auto absolute flex flex-col rounded-2xl border-[3px] shadow-2xl ${
                meta.isMinimized ? "invisible" : ""
            }`}
            style={{
                left: meta.position.x,
                top: meta.position.y,
                width: meta.size.width,
                height: meta.size.height,
                zIndex: meta.zIndex,
                borderColor: "var(--border)",
                background: "var(--panel)",
            }}
            onPointerDown={() => focusWindow(app)}
        >
            {/* overflow-hidden lives here, not on the outer sized/bordered
                box above — that box also holds the resize grip below, and
                clipping at this level would cut off a chunk of the grip's
                hit area right at the rounded corner (border-radius minus
                border-width leaves an effective ~13px clip radius against
                a 16px grip, right where a user aims). The outer border
                still renders its own rounded curve regardless of overflow. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
                <div
                    className="flex cursor-grab items-center justify-between gap-2 border-b px-3 py-2 active:cursor-grabbing"
                    style={{ borderColor: "var(--border)", background: "var(--panel-raised)" }}
                    onPointerDown={startDragging}
                >
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden="true">{icon}</span>
                        <span className="truncate text-xs font-bold" style={{ color: "var(--heading)" }}>
                            {title}
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                minimizeWindow(app);
                            }}
                            aria-label={`Minimize ${title}`}
                            className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors hover:bg-black/20"
                            style={{ color: "var(--muted)" }}
                        >
                            _
                        </button>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                if (interceptClose?.()) return;
                                onBeforeClose?.();
                                closeWindow(app);
                            }}
                            aria-label={`Close ${title}`}
                            className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors hover:bg-[var(--status-overdue-bg)]"
                            style={{ color: "var(--muted)" }}
                        >
                            ✕
                        </button>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </div>

            {/* Resize grip — bottom-right corner only, hand-rolled to match
                the drag gesture's style (fresh non-memoized closures per
                gesture, no useCallback self-reference). Sits outside the
                overflow-hidden wrapper above so its full hit area is
                clickable, not clipped by the rounded corner. */}
            <div
                onPointerDown={startResizing}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
                style={{ background: "linear-gradient(135deg, transparent 50%, var(--border) 50%)" }}
                aria-hidden="true"
            />
        </div>
    );
}
