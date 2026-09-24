"use client";

import PomodoroTimer, { STORAGE_KEY } from "@/components/PomodoroTimer";
import { usePomodoroRemote } from "@/components/os/PomodoroRemoteContext";
import Window from "./Window";
import { TimerIcon } from "@/components/brand/Icons";

// Wraps the real, unmodified PomodoroTimer in draggable window chrome.
// Safe to mount/unmount freely with Window's own isOpen check — the
// timer's own pomodoro_state persistence is endTime-timestamp-based, so
// it recovers the correct remaining time on remount with no special
// handling (confirmed before this refactor — see the plan file).
export default function PomodoroWindow() {
    const { focusTaskSummary, setFocusTask } = usePomodoroRemote();

    return (
        <Window
            app="pomodoro"
            title="The Watch"
            icon={<TimerIcon size={14} />}
            // Unlike Music (unmounting the player already stops audio for
            // free), Pomodoro's countdown would otherwise keep silently
            // ticking toward its endTime in the background after the
            // window closes — pause it explicitly so "closed" genuinely
            // means stopped, matching what "close" does for Music.
            //
            // Deliberately does NOT go through engineActions.toggleTimer():
            // that dispatches a setState inside PomodoroTimer, but
            // closeWindow's resulting unmount lands in the *same* React
            // batch, so the component is torn down before its own persist
            // effect ever gets to observe and write the paused state —
            // React drops pending updates for a component unmounted in the
            // same commit. Writing the paused snapshot straight to
            // localStorage sidesteps that component's lifecycle entirely,
            // guaranteeing it applies before the unmount.
            onBeforeClose={() => {
                try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (!raw) return;

                    const parsed = JSON.parse(raw) as { isRunning?: boolean; endTime?: number | null };
                    if (!parsed.isRunning) return;

                    const remaining =
                        typeof parsed.endTime === "number"
                            ? Math.max(0, Math.ceil((parsed.endTime - Date.now()) / 1000))
                            : 0;

                    localStorage.setItem(
                        STORAGE_KEY,
                        JSON.stringify({ ...parsed, isRunning: false, endTime: null, timeRemaining: remaining })
                    );
                } catch {
                    // Malformed/inaccessible storage — nothing to pause.
                }
            }}
        >
            <PomodoroTimer focusTask={focusTaskSummary} onClearFocusTask={() => setFocusTask(null)} />
        </Window>
    );
}
