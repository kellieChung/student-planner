"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type WindowAppId = "pomodoro" | "music";

export type WindowMeta = {
    isOpen: boolean;
    isMinimized: boolean;
    position: { x: number; y: number };
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
    focusWindow: (app: WindowAppId) => void;
};

const DEFAULT_POSITIONS: Record<WindowAppId, { x: number; y: number }> = {
    pomodoro: { x: 24, y: 24 },
    music: { x: 420, y: 24 },
};

function defaultWindowMeta(app: WindowAppId): WindowMeta {
    return { isOpen: false, isMinimized: false, position: DEFAULT_POSITIONS[app], zIndex: 0 };
}

function defaultState(): WindowManagerState {
    return { pomodoro: defaultWindowMeta("pomodoro"), music: defaultWindowMeta("music") };
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
                }));
                const maxZ = Math.max(parsed.pomodoro?.zIndex ?? 0, parsed.music?.zIndex ?? 0);
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

    const value = useMemo<WindowManagerContextValue>(
        () => ({ windows, openWindow, closeWindow, minimizeWindow, restoreWindow, moveWindow, focusWindow }),
        [windows, openWindow, closeWindow, minimizeWindow, restoreWindow, moveWindow, focusWindow]
    );

    return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
}
