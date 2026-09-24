"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type WindowAppId = "pomodoro" | "music" | "courses" | "rundown";

export type WindowMeta = {
    isOpen: boolean;
    isMinimized: boolean;
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex: number;
};

type WindowManagerState = Record<WindowAppId, WindowMeta>;

type WindowManagerContextValue = {
    windows: WindowManagerState;
    openWindow: (app: WindowAppId) => void;
    closeWindow: (app: WindowAppId) => void;
    minimizeWindow: (app: WindowAppId) => void;
    restoreWindow: (app: WindowAppId) => void;
    moveWindow: (app: WindowAppId, position: { x: number; y: number }) => void;
    resizeWindow: (app: WindowAppId, size: { width: number; height: number }) => void;
    focusWindow: (app: WindowAppId) => void;
};

const MIN_WINDOW_WIDTH = 280;
const MIN_WINDOW_HEIGHT = 200;

const DEFAULT_POSITIONS: Record<WindowAppId, { x: number; y: number }> = {
    pomodoro: { x: 24, y: 24 },
    music: { x: 24, y: 24 },
    courses: { x: 480, y: 60 },
    rundown: { x: 48, y: 48 },
};

const DEFAULT_SIZES: Record<WindowAppId, { width: number; height: number }> = {
    pomodoro: { width: 340, height: 480 },
    music: { width: 800, height: 520 },
    courses: { width: 440, height: 520 },
    rundown: { width: 860, height: 600 },
};

const APP_IDS: WindowAppId[] = ["pomodoro", "music", "courses", "rundown"];
const VIEWPORT_MARGIN = 16;

// Keeps a window fully on screen (the app is full-bleed and follows the
// browser size): shrink it if the screen is smaller, then pull it back in.
function clampToViewport(meta: WindowMeta): WindowMeta {
    if (typeof window === "undefined") return meta;

    const maxWidth = Math.max(MIN_WINDOW_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const maxHeight = Math.max(MIN_WINDOW_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
    const width = Math.min(meta.size.width, maxWidth);
    const height = Math.min(meta.size.height, maxHeight);
    const x = Math.min(Math.max(0, meta.position.x), Math.max(0, window.innerWidth - width - VIEWPORT_MARGIN));
    const y = Math.min(Math.max(0, meta.position.y), Math.max(0, window.innerHeight - height - VIEWPORT_MARGIN));

    if (width === meta.size.width && height === meta.size.height && x === meta.position.x && y === meta.position.y) {
        return meta;
    }

    return { ...meta, position: { x, y }, size: { width, height } };
}

// Saved geometry comes from whatever screen the app was last used on.
function clampAll(state: WindowManagerState): WindowManagerState {
    let changed = false;
    const next = { ...state };

    for (const app of APP_IDS) {
        const clamped = clampToViewport(state[app]);
        if (clamped !== state[app]) {
            next[app] = clamped;
            changed = true;
        }
    }

    return changed ? next : state;
}

function defaultWindowMeta(app: WindowAppId): WindowMeta {
    return {
        isOpen: false,
        isMinimized: false,
        position: DEFAULT_POSITIONS[app],
        size: DEFAULT_SIZES[app],
        zIndex: 0,
    };
}

function defaultState(): WindowManagerState {
    return {
        pomodoro: defaultWindowMeta("pomodoro"),
        music: defaultWindowMeta("music"),
        courses: defaultWindowMeta("courses"),
        rundown: defaultWindowMeta("rundown"),
    };
}

const STORAGE_KEY = "os_window_manager";

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function useWindowManager(): WindowManagerContextValue {
    const ctx = useContext(WindowManagerContext);
    if (!ctx) throw new Error("useWindowManager must be used within WindowManagerProvider");
    return ctx;
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
    const [windows, setWindows] = useState<WindowManagerState>(defaultState);
    const [loaded, setLoaded] = useState(false);
    const [nextZIndex, setNextZIndex] = useState(1);

    // Genuinely per-device UI state, same precedent as pomodoro_state/
    // music-player-volume — a load-then-persist pair gated on `loaded` so
    // the persist effect can't fire on initial mount (with the empty
    // default state) and clobber whatever was saved from a previous visit.
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<WindowManagerState>;
                setWindows((current) => clampAll({
                    pomodoro: { ...current.pomodoro, ...parsed.pomodoro },
                    music: { ...current.music, ...parsed.music },
                    courses: { ...current.courses, ...parsed.courses },
                    // Position/size persist, but the Rundown's open state never
                    // does: it only opens when there's something new or the user
                    // asks. Keep `current`'s value, not false — child effects run
                    // before this one, so an auto-show openWindow("rundown") may
                    // already be queued ahead of this load.
                    rundown: {
                        ...current.rundown,
                        ...parsed.rundown,
                        isOpen: current.rundown.isOpen,
                        isMinimized: current.rundown.isMinimized,
                    },
                }) as WindowManagerState);
                const maxZ = Math.max(...APP_IDS.map((app) => parsed[app]?.zIndex ?? 0));
                setNextZIndex(maxZ + 1);
            }
        } catch {
            // Malformed or inaccessible storage — start fresh.
        }
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (!loaded) return;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(windows));
        } catch {
            // Ignore — losing this is a minor inconvenience, not data loss.
        }
    }, [windows, loaded]);

    const focusWindow = useCallback(
        (app: WindowAppId) => {
            setWindows((current) => ({
                ...current,
                [app]: { ...current[app], zIndex: nextZIndex },
            }));
            setNextZIndex((z) => z + 1);
        },
        [nextZIndex]
    );

    useEffect(() => {
        const handleResize = () => setWindows(clampAll);

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const openWindow = useCallback(
        (app: WindowAppId) => {
            setWindows((current) => ({
                ...current,
                [app]: clampToViewport({ ...current[app], isOpen: true, isMinimized: false }),
            }));
            focusWindow(app);
        },
        [focusWindow]
    );

    const closeWindow = useCallback((app: WindowAppId) => {
        setWindows((current) => ({
            ...current,
            [app]: { ...current[app], isOpen: false, isMinimized: false },
        }));
    }, []);

    const minimizeWindow = useCallback((app: WindowAppId) => {
        setWindows((current) => ({
            ...current,
            [app]: { ...current[app], isMinimized: true },
        }));
    }, []);

    const restoreWindow = useCallback(
        (app: WindowAppId) => {
            setWindows((current) => ({
                ...current,
                [app]: { ...current[app], isMinimized: false },
            }));
            focusWindow(app);
        },
        [focusWindow]
    );

    // Keeps at least the title bar reachable, so a window can't be dragged
    // somewhere it can no longer be grabbed back from.
    const moveWindow = useCallback((app: WindowAppId, position: { x: number; y: number }) => {
        const maxX = typeof window === "undefined" ? position.x : window.innerWidth - 120;
        const maxY = typeof window === "undefined" ? position.y : window.innerHeight - 48;

        setWindows((current) => ({
            ...current,
            [app]: {
                ...current[app],
                position: { x: Math.min(Math.max(0, position.x), maxX), y: Math.min(Math.max(0, position.y), maxY) },
            },
        }));
    }, []);

    const resizeWindow = useCallback((app: WindowAppId, size: { width: number; height: number }) => {
        setWindows((current) => ({
            ...current,
            [app]: {
                ...current[app],
                size: {
                    width: Math.max(MIN_WINDOW_WIDTH, size.width),
                    height: Math.max(MIN_WINDOW_HEIGHT, size.height),
                },
            },
        }));
    }, []);

    const value = useMemo<WindowManagerContextValue>(
        () => ({
            windows,
            openWindow,
            closeWindow,
            minimizeWindow,
            restoreWindow,
            moveWindow,
            resizeWindow,
            focusWindow,
        }),
        [windows, openWindow, closeWindow, minimizeWindow, restoreWindow, moveWindow, resizeWindow, focusWindow]
    );

    return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
}
