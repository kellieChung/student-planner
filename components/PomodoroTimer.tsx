"use client";

import { useEffect, useState } from "react";

export type PomodoroFocusTask = {
    id: string;
    name: string;
    course: string;
    due: string;
    priorityReason: string;
};

type PomodoroTimerProps = {
    focusTask: PomodoroFocusTask | null;
    onClearFocusTask: () => void;
};

type PomodoroMode = "focus" | "shortBreak" | "longBreak";

const DURATIONS: Record<PomodoroMode, number> = {
    focus: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
};

const MODE_LABELS: Record<PomodoroMode, string> = {
    focus: "Focus Session",
    shortBreak: "Short Break",
    longBreak: "Long Break",
};

const MODE_MESSAGES: Record<PomodoroMode, string> = {
    focus: "Time to work on the quest.",
    shortBreak: "Rest your mind before the next quest.",
    longBreak: "You've earned a longer rest, adventurer.",
};

type PomodoroState = {
    mode: PomodoroMode;
    timeRemaining: number;
    duration: number;
    isRunning: boolean;
    completedSessions: number;
    endTime: number | null;
};

const DEFAULT_STATE: PomodoroState = {
    mode: "focus",
    timeRemaining: DURATIONS.focus,
    duration: DURATIONS.focus,
    isRunning: false,
    completedSessions: 0,
    endTime: null,
};

const STORAGE_KEY = "pomodoro_state";

function formatTime(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds
    ).padStart(2, "0")}`;
}

function getNextMode(
    mode: PomodoroMode,
    completedSessions: number
): PomodoroMode {
    if (mode !== "focus") {
        return "focus";
    }

    // Every fourth completed focus session gets a long break.
    if (completedSessions % 4 === 0) {
        return "longBreak";
    }

    return "shortBreak";
}

function parseTimeInput(value: string): number | null {
    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    // Allow plain minutes:
    // "45" → 45 minutes
    if (/^\d+$/.test(trimmed)) {
        const minutes = Number(trimmed);

        if (minutes <= 0) {
            return null;
        }

        return minutes * 60;
    }

    // Allow MM:SS:
    // "45:00"
    // "10:30"
    const match = trimmed.match(/^(\d+):([0-5]\d)$/);

    if (!match) {
        return null;
    }

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);

    const totalSeconds = minutes * 60 + seconds;

    if (totalSeconds <= 0) {
        return null;
    }

    return totalSeconds;
}

export default function PomodoroTimer({ focusTask, onClearFocusTask }: PomodoroTimerProps) {
    const [state, setState] =
        useState<PomodoroState>(DEFAULT_STATE);

    const [hydrated, setHydrated] = useState(false);
    const [isEditingTime, setIsEditingTime] = useState(false);
    const [timeInput, setTimeInput] = useState("");

    /*
     * Load the timer from localStorage.
     *
     * If the timer was running when the page was closed,
     * calculate the remaining time from the stored endTime.
     */
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (!stored) {
            setHydrated(true);
            return;
        }

        try {
            const parsed = JSON.parse(
                stored
            ) as Partial<PomodoroState>;

            if (
                parsed.mode !== "focus" &&
                parsed.mode !== "shortBreak" &&
                parsed.mode !== "longBreak"
            ) {
                throw new Error("Invalid Pomodoro mode.");
            }

            if (
                typeof parsed.timeRemaining !== "number" ||
                typeof parsed.duration !== "number" ||
                typeof parsed.isRunning !== "boolean" ||
                typeof parsed.completedSessions !== "number"
            ) {
                throw new Error("Invalid Pomodoro state.");
            }

            let timeRemaining = parsed.timeRemaining;
            let isRunning = parsed.isRunning;
            let endTime =
                typeof parsed.endTime === "number"
                    ? parsed.endTime
                    : null;

            /*
             * If the timer was running, determine how much time
             * actually remains instead of trusting the old countdown.
             */
            if (isRunning && endTime !== null) {
                const remaining = Math.ceil(
                    (endTime - Date.now()) / 1000
                );

                if (remaining > 0) {
                    timeRemaining = remaining;
                } else {
                    timeRemaining = 0;
                    isRunning = false;
                    endTime = null;
                }
            }

            setState({
                mode: parsed.mode,
                timeRemaining,
                duration: parsed.duration,
                isRunning,
                completedSessions:
                    parsed.completedSessions,
                endTime,
            });
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }

        setHydrated(true);
    }, []);

    /*
     * Persist the non-countdown state.
     *
     * While running, the important piece of information is endTime.
     * This avoids relying on localStorage being updated every second.
     */
    useEffect(() => {
        if (!hydrated) return;

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );
    }, [
        state.mode,
        state.duration,
        state.isRunning,
        state.completedSessions,
        state.endTime,
        state.timeRemaining,
        hydrated,
    ]);

    /*
     * Timer countdown.
     *
     * The displayed time is calculated from endTime, making the timer
     * resistant to tab throttling and page navigation.
     */
    useEffect(() => {
        if (!state.isRunning || state.endTime === null) {
            return;
        }

        const updateTimer = () => {
            setState((current) => {
                if (
                    !current.isRunning ||
                    current.endTime === null
                ) {
                    return current;
                }

                const remaining = Math.ceil(
                    (current.endTime - Date.now()) / 1000
                );

                if (remaining > 0) {
                    return {
                        ...current,
                        timeRemaining: remaining,
                    };
                }

                /*
                 * Timer finished.
                 */
                if (current.mode === "focus") {
                    const completedSessions =
                        current.completedSessions + 1;

                    const nextMode = getNextMode(
                        "focus",
                        completedSessions
                    );

                    return {
                        mode: nextMode,
                        timeRemaining:
                            DURATIONS[nextMode],
                        duration:
                            DURATIONS[nextMode],
                        isRunning: false,
                        completedSessions,
                        endTime: null,
                    };
                }

                /*
                 * Break finished → return to focus.
                 */
                return {
                    ...current,
                    mode: "focus",
                    timeRemaining: DURATIONS.focus,
                    duration: DURATIONS.focus,
                    isRunning: false,
                    endTime: null,
                };
            });
        };

        updateTimer();

        const interval = window.setInterval(
            updateTimer,
            250
        );

        return () => {
            window.clearInterval(interval);
        };
    }, [state.isRunning, state.endTime]);

    /*
     * Start / pause.
     */
    const toggleTimer = () => {
        setState((current) => {
            if (current.isRunning) {
                /*
                 * Pause the timer.
                 */
                const remaining =
                    current.endTime === null
                        ? current.timeRemaining
                        : Math.max(
                              0,
                              Math.ceil(
                                  (current.endTime -
                                      Date.now()) /
                                      1000
                              )
                          );

                return {
                    ...current,
                    timeRemaining: remaining,
                    isRunning: false,
                    endTime: null,
                };
            }

            /*
             * Start the timer.
             */
            const endTime =
                Date.now() +
                current.timeRemaining * 1000;

            return {
                ...current,
                isRunning: true,
                endTime,
            };
        });
    };

    /*
     * Reset the current mode to its current duration.
     *
     * This means a user-customized 45-minute focus session
     * resets to 45 minutes rather than reverting to 25.
     */
    const resetTimer = () => {
        setState((current) => ({
            ...current,
            timeRemaining: current.duration,
            isRunning: false,
            endTime: null,
        }));
    };

    /*
     * Switch between Focus / Short Break / Long Break.
     *
     * Switching modes restores the suggested default duration
     * for that mode.
     */
    const changeMode = (mode: PomodoroMode) => {
        setState({
            mode,
            timeRemaining: DURATIONS[mode],
            duration: DURATIONS[mode],
            isRunning: false,
            completedSessions: state.completedSessions,
            endTime: null,
        });

        setIsEditingTime(false);
        setTimeInput("");
    };

    /*
     * Open the custom duration editor.
     */
    const startEditingTime = () => {
        setTimeInput(formatTime(state.timeRemaining));
        setIsEditingTime(true);
    };

    /*
     * Save a custom duration.
     *
     * Accepts either:
     * "45"
     * "45:00"
     * "10:30"
     */
    const saveCustomTime = () => {
        const seconds = parseTimeInput(timeInput);

        if (seconds === null) {
            return;
        }

        setState((current) => ({
            ...current,
            duration: seconds,
            timeRemaining: seconds,
            isRunning: false,
            endTime: null,
        }));

        setIsEditingTime(false);
        setTimeInput("");
    };

    /*
     * Cancel custom duration editing.
     */
    const cancelEditingTime = () => {
        setIsEditingTime(false);
        setTimeInput("");
    };

    /*
     * Allow Enter to save and Escape to cancel.
     */
    const handleTimeInputKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>
    ) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveCustomTime();
        }

        if (event.key === "Escape") {
            event.preventDefault();
            cancelEditingTime();
        }
    };

    const progress =
        state.duration > 0
            ? ((state.duration -
                  state.timeRemaining) /
                  state.duration) *
              100
            : 0;

    const isDefaultDuration =
        state.duration === DURATIONS[state.mode];

    return (
        <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                        Focus Tavern
                    </p>

                    <h2 className="mt-1 text-lg font-bold text-slate-100">
                        🍅 {MODE_LABELS[state.mode]}
                    </h2>
                </div>

                <div className="text-right">
                    <p className="text-xs text-slate-500">
                        Sessions
                    </p>

                    <p className="font-bold text-indigo-300">
                        {state.completedSessions} / 4
                    </p>
                </div>
            </div>

            {/* Focus task */}
            {focusTask ? (
                <div className="mb-5 rounded-xl border border-indigo-500/50 bg-indigo-950/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                                🎯 Working on
                            </p>
                            <p className="truncate text-sm font-semibold text-slate-100">
                                {focusTask.name}
                            </p>
                            <p className="text-xs text-slate-400">
                                {focusTask.course || "General"}
                                {focusTask.due ? ` · Due ${focusTask.due}` : ""}
                            </p>
                            <p className="mt-1 text-xs text-indigo-200">
                                {focusTask.priorityReason}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClearFocusTask}
                            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-slate-200"
                            title="Stop focusing on this task"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            ) : (
                <p className="mb-5 text-xs text-slate-500">
                    No task selected — pick &quot;🎯 Focus in Pomodoro&quot; on a task in your planner.
                </p>
            )}

            {/* Mode buttons */}
            <div className="mb-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-950 p-1">
                {(
                    [
                        ["focus", "Focus"],
                        ["shortBreak", "Short Break"],
                        ["longBreak", "Long Break"],
                    ] as const
                ).map(([mode, label]) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() =>
                            changeMode(mode)
                        }
                        className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                            state.mode === mode
                                ? "bg-slate-700 text-white"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Timer */}
            <div className="text-center">
                {isEditingTime ? (
                    <div className="flex flex-col items-center">
                        <input
                            autoFocus
                            type="text"
                            value={timeInput}
                            onChange={(event) =>
                                setTimeInput(
                                    event.target.value
                                )
                            }
                            onKeyDown={
                                handleTimeInputKeyDown
                            }
                            placeholder="25:00"
                            aria-label="Timer duration"
                            className="w-52 rounded-xl border border-indigo-500/60 bg-slate-950 px-3 py-2 text-center text-4xl font-bold tracking-tight text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />

                        <p className="mt-2 text-xs text-slate-500">
                            Enter minutes or MM:SS
                        </p>

                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={
                                    saveCustomTime
                                }
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                            >
                                Save
                            </button>

                            <button
                                type="button"
                                onClick={
                                    cancelEditingTime
                                }
                                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={startEditingTime}
                            className="group"
                            title="Click to change timer duration"
                        >
                            <div className="text-6xl font-bold tracking-tight text-slate-100 transition group-hover:text-indigo-300">
                                {formatTime(
                                    state.timeRemaining
                                )}
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={startEditingTime}
                            className="mt-2 text-xs font-semibold text-slate-500 transition hover:text-indigo-300"
                        >
                            ✏️ Edit time
                        </button>
                    </>
                )}

                <p className="mt-3 text-sm text-slate-400">
                    {MODE_MESSAGES[state.mode]}
                </p>

                {!isDefaultDuration && !isEditingTime && (
                    <p className="mt-1 text-xs text-indigo-400">
                        Custom duration ·{" "}
                        {formatTime(state.duration)}
                    </p>
                )}
            </div>

            {/* Progress */}
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                    style={{
                        width: `${Math.min(
                            100,
                            Math.max(0, progress)
                        )}%`,
                    }}
                />
            </div>

            {/* Controls */}
            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={toggleTimer}
                    className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
                >
                    {state.isRunning
                        ? "❚❚ Pause"
                        : "▶ Start"}
                </button>

                <button
                    type="button"
                    onClick={resetTimer}
                    className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:bg-slate-800"
                    aria-label="Reset timer"
                >
                    ↻
                </button>
            </div>

            {/* Session indicator */}
            <div className="mt-5 flex justify-center gap-2">
                {[0, 1, 2, 3].map((session) => (
                    <span
                        key={session}
                        className={`h-2.5 w-2.5 rounded-full ${
                            session <
                            state.completedSessions % 4
                                ? "bg-indigo-500"
                                : "bg-slate-700"
                        }`}
                    />
                ))}
            </div>
        </section>
    );
}