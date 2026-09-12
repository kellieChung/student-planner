"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useWindowManager, type WindowAppId } from "./WindowManagerContext";

type Props = {
    app: WindowAppId;
    title: string;
    icon: string;
    children: ReactNode;
    width?: number;
    // Called right before closeWindow fires — for apps where "closed"
    // needs to mean more than "the window disappears" (Pomodoro: closing
    // should actually pause the countdown, not leave it silently ticking
    // in the background while the window is gone — unlike Music, where
    // unmounting the player already stops the audio for free).
    onBeforeClose?: () => void;
};

// Generic draggable OS window chrome: a title bar (drag handle + minimize/
// close buttons) around arbitrary content. Dragging/position/z-order all
// live in WindowManagerContext, shared with the taskbar and the World's
// themed panels.
export default function Window({ app, title, icon, children, width = 360, onBeforeClose }: Props) {
    const { windows, moveWindow, minimizeWindow, closeWindow, focusWindow } = useWindowManager();
    const meta = windows[app];

    // Each drag builds its own pair of move/up handlers (closing over that
    // drag's own start position) instead of stable cross-render callbacks —
    // simpler than fighting for referential stability across renders, and
    // there's no cross-render state to keep in sync since each drag is
    // independent. stopDragRef holds whichever pair is currently active so
    // an unmount mid-drag can still clean up.
    const stopDragRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => stopDragRef.current?.();
    }, []);

    const startDragging = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;

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
            stopDragRef.current = null;
        };

        stopDragRef.current = stopDragging;
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", stopDragging);
    };

    if (!meta.isOpen) return null;

    return (
        <div
            className={`pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl border-[3px] shadow-2xl ${
                meta.isMinimized ? "invisible" : ""
            }`}
            style={{
                left: meta.position.x,
                top: meta.position.y,
                width,
                zIndex: meta.zIndex,
                borderColor: "var(--border)",
                background: "var(--panel)",
            }}
            onPointerDown={() => focusWindow(app)}
        >
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
                            onBeforeClose?.();
                            closeWindow(app);
                        }}
                        aria-label={`Close ${title}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors hover:bg-red-500/40"
                        style={{ color: "var(--muted)" }}
                    >
                        ✕
                    </button>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
    );
}
