"use client";

import NumberField from "@/components/ui/NumberField";
import { useEffect, useRef, useState } from "react";
import { GamificationState } from "@/types/gamification";
import { getGamificationState, saveGamificationState } from "@/lib/gamification";
import { getTodayString } from "@/lib/utils";

type Props = {
    initialGamification: GamificationState;
};

const CONFIRM_WINDOW_MS = 3000;

// Genuinely per-device scratch state for this dev tool, same precedent as
// pomodoro_state/music-player-volume elsewhere in this app — persisted so
// the "delete fake tasks" button survives a reload/navigation instead of
// silently losing track of what it created (caught live: generating tasks,
// then reloading this page, left the button reading "Delete 0 fake
// task(s)" with 5 real orphaned tasks still sitting in the planner).
const GENERATED_TASK_IDS_STORAGE_KEY = "gamification_dev_generated_task_ids";

type ConfirmButtonProps = {
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
};

// Deliberately not window.confirm()/alert() — those are blocking native
// dialogs, and this app's own gamification work was verified this session
// via Chrome-extension browser automation, which those dialogs stall out.
function ConfirmButton({ label, confirmLabel = "Click again to confirm", onConfirm, disabled }: ConfirmButtonProps) {
    const [confirming, setConfirming] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleClick = () => {
        if (confirming) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setConfirming(false);
            onConfirm();
            return;
        }

        setConfirming(true);
        timeoutRef.current = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={disabled}
            className="rounded-lg border px-3 py-2 text-xs font-bold transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            style={{
                borderColor: confirming ? "#f59e0b" : "var(--border)",
                background: confirming ? "rgb(245 158 11 / 0.15)" : "var(--panel-muted)",
                color: confirming ? "#f59e0b" : "var(--heading)",
            }}
        >
            {confirming ? confirmLabel : label}
        </button>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--heading)" }}>
                {title}
            </h2>
            {children}
        </div>
    );
}

const FAKE_TASK_TEMPLATES: Array<{ name: string; course: string }> = [
    { name: "Read Chapter 3 Notes", course: "Biology" },
    { name: "Problem Set 4", course: "Calculus" },
    { name: "Midterm Exam Review", course: "History" },
    { name: "Organize desk", course: "Personal" },
];

export default function GamificationDevPanel({ initialGamification }: Props) {
    const [gamification, setGamification] = useState<GamificationState>(initialGamification);
    const [busy, setBusy] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const [fakeTaskCount, setFakeTaskCount] = useState(5);
    const [generatedTaskIds, setGeneratedTaskIds] = useState<string[]>([]);
    const [generatedIdsLoaded, setGeneratedIdsLoaded] = useState(false);

    // Same load-then-persist hydration-race pattern already used elsewhere
    // in this app (PomodoroTimer's `hydrated`, MusicPlayer's
    // `preferencesLoaded`) — without the loaded gate, the persist effect
    // would fire on initial mount with the empty default state and
    // immediately clobber whatever was saved from a previous visit.
    useEffect(() => {
        try {
            const stored = localStorage.getItem(GENERATED_TASK_IDS_STORAGE_KEY);
            if (stored) setGeneratedTaskIds(JSON.parse(stored));
        } catch {
            // Malformed or inaccessible storage — start fresh.
        }
        setGeneratedIdsLoaded(true);
    }, []);

    useEffect(() => {
        if (!generatedIdsLoaded) return;

        try {
            localStorage.setItem(GENERATED_TASK_IDS_STORAGE_KEY, JSON.stringify(generatedTaskIds));
        } catch {
            // Ignore — losing this is a minor inconvenience, not data loss.
        }
    }, [generatedTaskIds, generatedIdsLoaded]);

    const refreshAll = async () => {
        const nextGamification = await getGamificationState();

        if (nextGamification) setGamification(nextGamification);
    };

    const runAction = async (message: string, action: () => Promise<void>) => {
        setBusy(true);

        try {
            await action();
            await refreshAll();
            setStatusMessage(message);
        } catch (error) {
            console.error("Dev panel action failed", error);
            setStatusMessage("Action failed — see console.");
        } finally {
            setBusy(false);
        }
    };

    const resetXp = () =>
        runAction("XP reset to 0.", () => saveGamificationState({ totalXp: 0, awardedTaskIds: [] }));

    const generateFakeTasks = async () => {
        setBusy(true);

        try {
            const today = getTodayString();
            const newIds: string[] = [];

            for (let i = 0; i < fakeTaskCount; i++) {
                const template = FAKE_TASK_TEMPLATES[i % FAKE_TASK_TEMPLATES.length];
                const id = `custom-dev-${Date.now()}-${i}`;

                const response = await fetch("/api/custom-tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id,
                        name: `${template.name} #${i + 1}`,
                        course: template.course,
                        due: today,
                    }),
                });

                if (response.ok) newIds.push(id);
            }

            setGeneratedTaskIds((current) => [...current, ...newIds]);
            setStatusMessage(`Generated ${newIds.length} fake task(s) — go complete them at "/".`);
        } catch (error) {
            console.error("Fake task generation failed", error);
            setStatusMessage("Fake task generation failed — see console.");
        } finally {
            setBusy(false);
        }
    };

    const deleteFakeTasks = async () => {
        setBusy(true);

        try {
            for (const id of generatedTaskIds) {
                await fetch(`/api/custom-tasks/${id}`, { method: "DELETE" });
            }

            setStatusMessage(`Deleted ${generatedTaskIds.length} fake task(s).`);
            setGeneratedTaskIds([]);
        } catch (error) {
            console.error("Fake task cleanup failed", error);
            setStatusMessage("Fake task cleanup failed — see console.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 pb-16">
            <div>
                <p
                    className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: "var(--muted)" }}
                >
                    Dev tool — not linked from the main app
                </p>
                <h1 className="text-2xl font-bold" style={{ color: "var(--heading)" }}>
                    XP & test tasks
                </h1>
            </div>

            {statusMessage && (
                <div
                    className="rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--heading)" }}
                >
                    {statusMessage}
                </div>
            )}

            <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: "#f59e0b", background: "rgb(245 158 11 / 0.1)", color: "#f59e0b" }}
            >
                ⚠️ &quot;Reset XP&quot; mutates your real account&apos;s XP. Fake tasks are real custom tasks
                on your account until you delete them here. To replay onboarding, use the Onboarding tour tab.
            </div>

            <Card title="Real-account controls">
                <div className="flex flex-wrap gap-2">
                    <ConfirmButton label="Reset XP to 0" onConfirm={resetXp} disabled={busy} />
                </div>
            </Card>

            <Card title="Fake task generator">
                <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
                    Creates tasks due today across Biology/Calculus/History/Personal so they classify
                    as different label types — go to <code>/</code> and complete them to exercise the
                    real XP and Starlight flow.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <NumberField ariaLabel="Number of fake tasks" min={1} max={20} value={fakeTaskCount} onChange={setFakeTaskCount} />
                    <button
                        type="button"
                        onClick={generateFakeTasks}
                        disabled={busy}
                        className="rounded-lg border px-3 py-2 text-xs font-bold transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                        style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--heading)" }}
                    >
                        Generate fake tasks
                    </button>
                    <button
                        type="button"
                        onClick={deleteFakeTasks}
                        disabled={busy || generatedTaskIds.length === 0}
                        className="rounded-lg border px-3 py-2 text-xs font-bold transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                    >
                        Delete {generatedTaskIds.length} fake task(s)
                    </button>
                </div>
            </Card>

            <Card title="Raw state">
                <pre
                    className="overflow-auto rounded-lg p-3 text-[11px]"
                    style={{ background: "var(--panel-muted)", color: "var(--foreground)" }}
                >
                    {JSON.stringify({ gamification, generatedTaskIds }, null, 2)}
                </pre>
            </Card>
        </div>
    );
}
