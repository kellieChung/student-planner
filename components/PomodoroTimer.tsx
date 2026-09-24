"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePomodoroRemote } from "@/components/os/PomodoroRemoteContext";

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
    focus: "Heads down. One task, one session, then a breather.",
    shortBreak: "Step away for a few minutes. Look at something far away.",
    longBreak: "A good stretch of work. Take a longer rest before the next one.",
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

// Exported so PomodoroWindow.tsx can write a paused snapshot directly on
// Close — see that file's onBeforeClose for why (closeWindow's unmount and
// a setState-based pause race in the same React batch, so the pause can't
// reliably go through this component's own state+persist-effect pipeline
// at that exact moment).
export const STORAGE_KEY = "pomodoro_state";

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

    // Publishes this instance's live state/actions into PomodoroRemoteContext
    // so the OS taskbar and the World's HourglassPanel can render/control the
    // exact same timer. Refs (rather than putting toggleTimer/resetTimer/
    // changeMode directly in the effect's deps) keep the published action
    // wrappers permanently stable — those three functions are recreated every
    // render, so using them as deps directly would re-fire this effect (and
    // the context's setState) on every render, including ones this effect
    // itself causes via the Provider re-rendering its subtree.
    const { publishEngine: publishPomodoroEngine, clearEngine: clearPomodoroEngine } = usePomodoroRemote();
    const toggleTimerRef = useRef(toggleTimer);
    const resetTimerRef = useRef(resetTimer);
    const changeModeRef = useRef(changeMode);

    useEffect(() => {
        toggleTimerRef.current = toggleTimer;
        resetTimerRef.current = resetTimer;
        changeModeRef.current = changeMode;
    });

    const stableActions = useMemo(
        () => ({
            toggleTimer: () => toggleTimerRef.current(),
            resetTimer: () => resetTimerRef.current(),
            changeMode: (mode: PomodoroMode) => changeModeRef.current(mode),
        }),
        []
    );

    useEffect(() => {
        publishPomodoroEngine(
            {
                mode: state.mode,
                timeRemaining: state.timeRemaining,
                duration: state.duration,
                isRunning: state.isRunning,
                completedSessions: state.completedSessions,
            },
            stableActions
        );
    }, [
        publishPomodoroEngine,
        state.mode,
        state.timeRemaining,
        state.duration,
        state.isRunning,
        state.completedSessions,
        stableActions,
    ]);

    useEffect(() => {
        return () => clearPomodoroEngine();
    }, [clearPomodoroEngine]);

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
        <section className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-lg">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                        The Watch
                    </p>

                    <h2 className="mt-0.5 text-sm font-bold text-[var(--foreground)]">
                        {MODE_LABELS[state.mode]}
                    </h2>
                </div>

                <div className="text-right">
                    <p className="text-[10px] text-[var(--muted)]">
                        Sessions
                    </p>

                    <p className="text-sm font-bold text-[var(--accent)]">
                        {state.completedSessions} / 4
                    </p>
                </div>
            </div>

            {/* Focus task */}
            {focusTask ? (
                <div className="mb-3 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent-soft)] p-2">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                                Working on
                            </p>
                            <p className="truncate text-xs font-semibold text-[var(--foreground)]">
                                {focusTask.name}
                            </p>
                            <p className="text-[11px] text-[var(--muted)]">
                                {focusTask.course || "General"}
                                {focusTask.due ? ` · Due ${focusTask.due}` : ""}
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--muted)]">
                                {focusTask.priorityReason}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClearFocusTask}
                            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                            title="Stop focusing on this task"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            ) : (
                <p className="mb-3 text-[11px] text-[var(--muted)]">
                    No task selected — pick &quot;Focus on the Watch&quot; on a task in your planner.
                </p>
            )}

            {/* Mode buttons */}
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--panel-muted)] p-1">
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
                        className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                            state.mode === mode
                                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
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
                            className="w-52 rounded-xl border border-[var(--accent)] bg-[var(--panel-muted)] px-3 py-2 text-center font-[family-name:var(--font-spectral)] text-4xl font-medium tabular-nums tracking-tight text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />

                        <p className="mt-2 text-xs text-[var(--muted)]">
                            Enter minutes or MM:SS
                        </p>

                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={
                                    saveCustomTime
                                }
                                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                            >
                                Save
                            </button>

                            <button
                                type="button"
                                onClick={
                                    cancelEditingTime
                                }
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--panel-muted)]"
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
                            <div className="font-[family-name:var(--font-spectral)] text-4xl font-medium tabular-nums tracking-tight text-[var(--foreground)] transition group-hover:text-[var(--accent)]">
                                {formatTime(
                                    state.timeRemaining
                                )}
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={startEditingTime}
                            className="mx-auto mt-1 block text-[11px] font-semibold text-[var(--muted)] transition hover:text-[var(--accent)]"
                        >
                            Edit time
                        </button>
                    </>
                )}

                <p className="mt-2 text-xs text-[var(--muted)]">
                    {MODE_MESSAGES[state.mode]}
                </p>

                {!isDefaultDuration && !isEditingTime && (
                    <p className="mt-1 text-[11px] text-[var(--accent)]">
                        Custom duration ·{" "}
                        {formatTime(state.duration)}
                    </p>
                )}
            </div>

            {/* Progress */}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--xp-track)]">
                <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                    style={{
                        width: `${Math.min(
                            100,
                            Math.max(0, progress)
                        )}%`,
                    }}
                />
            </div>

            {/* Controls */}
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={toggleTimer}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-hover)]"
                >
                    {state.isRunning ? <PauseGlyph /> : <PlayGlyph />}
                    {state.isRunning ? "Pause" : "Start"}
                </button>

                <button
                    type="button"
                    onClick={resetTimer}
                    className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--panel-muted)]"
                    aria-label="Reset timer"
                >
                    <ResetGlyph />
                </button>
            </div>

            {/* Session indicator */}
            <div className="mt-3 flex justify-center gap-2">
                {[0, 1, 2, 3].map((session) => (
                    <span
                        key={session}
                        className={`h-2 w-2 rounded-full ${
                            session <
                            state.completedSessions % 4
                                ? "bg-[var(--accent)]"
                                : "bg-[var(--border)]"
                        }`}
                    />
                ))}
            </div>
        </section>
    );
}

function PlayGlyph() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M7.5 5.14a1 1 0 0 1 1.5-.87l10.5 6.86a1 1 0 0 1 0 1.74L9 19.73a1 1 0 0 1-1.5-.87Z" />
        </svg>
    );
}

function PauseGlyph() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
    );
}

function ResetGlyph() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" />
        </svg>
    );
}
