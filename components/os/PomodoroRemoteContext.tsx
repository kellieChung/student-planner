"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Same key this app has always used for this (previously owned by
// WeeklyPlannerView) — kept unchanged so existing users' saved focus task
// carries over.
const FOCUS_TASK_STORAGE_KEY = "pomodoro_active_task_id";

export type PomodoroMode = "focus" | "shortBreak" | "longBreak";

export type PomodoroFocusTaskSummary = {
    id: string;
    name: string;
    course: string;
    due: string;
    priorityReason: string;
};

export type PomodoroEngineState = {
    mode: PomodoroMode;
    timeRemaining: number;
    duration: number;
    isRunning: boolean;
    completedSessions: number;
};

export type PomodoroEngineActions = {
    toggleTimer: () => void;
    resetTimer: () => void;
    changeMode: (mode: PomodoroMode) => void;
};

type PomodoroRemoteContextValue = {
    focusTaskId: string | null;
    setFocusTask: (id: string | null) => void;
    focusTaskSummary: PomodoroFocusTaskSummary | null;
    setFocusTaskSummary: (summary: PomodoroFocusTaskSummary | null) => void;
    // null while the Pomodoro window isn't open — nothing is publishing.
    engineState: PomodoroEngineState | null;
    engineActions: PomodoroEngineActions | null;
    publishEngine: (state: PomodoroEngineState, actions: PomodoroEngineActions) => void;
    clearEngine: () => void;
};

const PomodoroRemoteContext = createContext<PomodoroRemoteContextValue | null>(null);

export function usePomodoroRemote(): PomodoroRemoteContextValue {
    const ctx = useContext(PomodoroRemoteContext);
    if (!ctx) throw new Error("usePomodoroRemote must be used within PomodoroRemoteProvider");
    return ctx;
}

// Owns "which task is focused" directly (lifted out of WeeklyPlannerView,
// which now reads/writes it here instead of local state) plus a channel
// for the real PomodoroTimer instance (wherever it's currently mounted —
// components/os/PomodoroWindow.tsx) to publish its live countdown state
// and register remote-controllable actions, so both the OS window and the
// World's HourglassPanel render the exact same live timer.
export function PomodoroRemoteProvider({ children }: { children: ReactNode }) {
    const [focusTaskId, setFocusTaskIdState] = useState<string | null>(null);
    const [focusTaskSummary, setFocusTaskSummary] = useState<PomodoroFocusTaskSummary | null>(null);
    const [engineState, setEngineState] = useState<PomodoroEngineState | null>(null);
    const [engineActions, setEngineActions] = useState<PomodoroEngineActions | null>(null);

    // One-time load, same convention as every other localStorage-backed
    // per-device key in this app (no "loaded" gate needed here since,
    // unlike a persist-effect, this only ever runs once on mount and never
    // writes anything back).
    useEffect(() => {
        const saved = localStorage.getItem(FOCUS_TASK_STORAGE_KEY);
        if (saved) setFocusTaskIdState(saved);
    }, []);

    const setFocusTask = useCallback((id: string | null) => {
        setFocusTaskIdState(id);
        if (id) {
            localStorage.setItem(FOCUS_TASK_STORAGE_KEY, id);
        } else {
            localStorage.removeItem(FOCUS_TASK_STORAGE_KEY);
        }
    }, []);

    const publishEngine = useCallback((state: PomodoroEngineState, actions: PomodoroEngineActions) => {
        setEngineState(state);
        setEngineActions(actions);
    }, []);

    const clearEngine = useCallback(() => {
        setEngineState(null);
        setEngineActions(null);
    }, []);

    const value = useMemo<PomodoroRemoteContextValue>(
        () => ({
            focusTaskId,
            setFocusTask,
            focusTaskSummary,
            setFocusTaskSummary,
            engineState,
            engineActions,
            publishEngine,
            clearEngine,
        }),
        [focusTaskId, setFocusTask, focusTaskSummary, engineState, engineActions, publishEngine, clearEngine]
    );

    return <PomodoroRemoteContext.Provider value={value}>{children}</PomodoroRemoteContext.Provider>;
}
