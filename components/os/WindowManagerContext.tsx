"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type WindowAppId = "pomodoro" | "music" | "courses";

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
};

const DEFAULT_SIZES: Record<WindowAppId, { width: number; height: number }> = {
    pomodoro: { width: 340, height: 480 },
    music: { width: 800, height: 520 },
    courses: { width: 440, height: 520 },
};

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
                setWindows((current) => ({
                    pomodoro: { ...current.pomodoro, ...parsed.pomodoro },
                    music: { ...current.music, ...parsed.music },
                    courses: { ...current.courses, ...parsed.courses },
                }));
                const maxZ = Math.max(
                    parsed.pomodoro?.zIndex ?? 0,
                    parsed.music?.zIndex ?? 0,
                    parsed.courses?.zIndex ?? 0
                );
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

    const openWindow = useCallback(
        (app: WindowAppId) => {
            setWindows((current) => ({
                ...current,
                [app]: { ...current[app], isOpen: true, isMinimized: false },
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

    const moveWindow = useCallback((app: WindowAppId, position: { x: number; y: number }) => {
        setWindows((current) => ({
            ...current,
            [app]: { ...current[app], position },
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
