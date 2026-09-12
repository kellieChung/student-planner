"use client";

import { usePomodoroRemote } from "@/components/os/PomodoroRemoteContext";
import PixelBlock from "./PixelBlock";

type Props = {
    onClose: () => void;
};

const MODE_LABEL: Record<string, string> = {
    focus: "Focus Session",
    shortBreak: "Short Break",
    longBreak: "Long Break",
};

function formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

// A medieval-themed replica of the OS Pomodoro window — same live state,
// same actions (via PomodoroRemoteContext), different chrome. No engine of
// its own: the real PomodoroTimer instance (mounted in
// components/os/PomodoroWindow.tsx) keeps running underneath whether the
// laptop is open or this panel is showing instead.
export default function HourglassPanel({ onClose }: Props) {
    const { engineState, engineActions, focusTaskSummary } = usePomodoroRemote();

    return (
        <div
            className="w-72 rounded-xl border p-4 shadow-2xl"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <PixelBlock size="sm" emoji="⏳" tone="accent" />
                    <span className="text-sm font-bold" style={{ color: "var(--heading)" }}>
                        The Hourglass
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded px-1.5 text-xs"
                    style={{ color: "var(--muted)" }}
                    aria-label="Close"
                >
                    ✕
                </button>
            </div>

            {!engineState || !engineActions ? (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Waking the hourglass...
                </p>
            ) : (
                <>
                    <div className="mb-3 flex rounded-lg p-1" style={{ background: "var(--panel-muted)" }}>
                        {(["focus", "shortBreak", "longBreak"] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => engineActions.changeMode(mode)}
                                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                                    engineState.mode === mode ? "text-white" : ""
                                }`}
                                style={{
                                    background: engineState.mode === mode ? "var(--accent)" : "transparent",
                                    color: engineState.mode === mode ? undefined : "var(--muted)",
                                }}
                            >
                                {MODE_LABEL[mode]}
                            </button>
                        ))}
                    </div>

                    {focusTaskSummary && (
                        <div
                            className="mb-3 rounded-lg border px-2 py-1.5"
                            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
                        >
                            <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                                Questing on
                            </p>
                            <p className="truncate text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                                {focusTaskSummary.name}
                            </p>
                        </div>
                    )}

                    <div className="text-center">
                        <div className="text-3xl font-bold tracking-tight" style={{ color: "var(--heading)" }}>
                            {formatTime(engineState.timeRemaining)}
                        </div>
                        <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                            Sessions completed: {engineState.completedSessions}
                        </p>
                    </div>

                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={engineActions.toggleTimer}
                            className="flex-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-transform hover:scale-105"
                            style={{ background: "var(--accent)" }}
                        >
                            {engineState.isRunning ? "❚❚ Pause" : "▶ Start"}
                        </button>
                        <button
                            type="button"
                            onClick={engineActions.resetTimer}
                            className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                            aria-label="Reset"
                        >
                            ↻
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
