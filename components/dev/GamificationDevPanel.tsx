"use client";

import { useEffect, useRef, useState } from "react";
import { GamificationState } from "@/types/gamification";
import { TownState, MascotTrigger } from "@/types/townState";
import { getGamificationState, saveGamificationState } from "@/lib/gamification";
import { getTownState, saveTownGrowth } from "@/lib/townState";
import { getTodayString } from "@/lib/utils";
import { pickLine } from "@/lib/mascotDialogue";
import WorldView from "@/components/world/WorldView";
import Mascot from "@/components/world/Mascot";
import OnboardingOverlay from "@/components/world/OnboardingOverlay";

type Props = {
    initialGamification: GamificationState;
    initialTownState: TownState;
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

export default function GamificationDevPanel({ initialGamification, initialTownState }: Props) {
    const [gamification, setGamification] = useState<GamificationState>(initialGamification);
    const [townState, setTownState] = useState<TownState>(initialTownState);
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

    const [previewCurrency, setPreviewCurrency] = useState(0);
    const [previewLibrary, setPreviewLibrary] = useState(0);
    const [previewWorkshop, setPreviewWorkshop] = useState(0);
    const [previewTrainingGrounds, setPreviewTrainingGrounds] = useState(0);
    const [previewWatchtower, setPreviewWatchtower] = useState(0);
    const [previewTownSquare, setPreviewTownSquare] = useState(0);
    const [previewStreak, setPreviewStreak] = useState(0);
    const [previewDialogue, setPreviewDialogue] = useState("");

    const [showIntroPreview, setShowIntroPreview] = useState(false);
    const [showTourPreview, setShowTourPreview] = useState(false);

    const refreshAll = async () => {
        const [nextGamification, nextTownState] = await Promise.all([
            getGamificationState(),
            getTownState(),
        ]);

        setGamification(nextGamification);
        setTownState(nextTownState);
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

    const resetTownGrowth = () =>
        runAction("Town growth/currency/streak reset to 0.", () =>
            saveTownGrowth({
                ...townState,
                currency: 0,
                libraryGrowth: 0,
                workshopGrowth: 0,
                trainingGroundsGrowth: 0,
                watchtowerGrowth: 0,
                townSquareGrowth: 0,
                currentStreak: 0,
                longestStreak: 0,
                graceTokens: 2,
                lastGoodDay: null,
            })
        );

    // No lib/townState.ts helper sets onboardingCompletedAt back to null —
    // the only existing writer (saveOnboardingCompletion) only ever sets a
    // real timestamp — so this is a direct, narrow PATCH matching the same
    // "send only the field you own" contract the route already enforces.
    const resetOnboarding = () =>
        runAction("Onboarding reset — reload the main app to see the intro again.", async () => {
            await fetch("/api/town-state", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ onboardingCompletedAt: null }),
            });
        });

    const resetEverything = () =>
        runAction("Everything reset: XP, town growth, and onboarding.", async () => {
            await saveGamificationState({ totalXp: 0, awardedTaskIds: [] });
            await saveTownGrowth({
                ...townState,
                currency: 0,
                libraryGrowth: 0,
                workshopGrowth: 0,
                trainingGroundsGrowth: 0,
                watchtowerGrowth: 0,
                townSquareGrowth: 0,
                currentStreak: 0,
                longestStreak: 0,
                graceTokens: 2,
                lastGoodDay: null,
            });
            await fetch("/api/town-state", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ onboardingCompletedAt: null }),
            });
        });

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

    const previewTownState: TownState = {
        currency: previewCurrency,
        libraryGrowth: previewLibrary,
        workshopGrowth: previewWorkshop,
        trainingGroundsGrowth: previewTrainingGrounds,
        watchtowerGrowth: previewWatchtower,
        townSquareGrowth: previewTownSquare,
        currentStreak: previewStreak,
        longestStreak: previewStreak,
        graceTokens: 2,
        lastGoodDay: null,
        onboardingCompletedAt: new Date().toISOString(),
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
                    Gamification test panel
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
                ⚠️ The buttons in &quot;Real-account controls&quot; below mutate your real account&apos;s
                data (XP, town growth, onboarding). Task generation/deletion and the live preview
                sandbox further down are safe — the preview never persists anything.
            </div>

            <Card title="Real-account controls">
                <div className="flex flex-wrap gap-2">
                    <ConfirmButton label="Reset XP to 0" onConfirm={resetXp} disabled={busy} />
                    <ConfirmButton label="Reset town growth" onConfirm={resetTownGrowth} disabled={busy} />
                    <ConfirmButton label="Reset onboarding" onConfirm={resetOnboarding} disabled={busy} />
                    <ConfirmButton label="Reset everything" onConfirm={resetEverything} disabled={busy} />
                </div>
            </Card>

            <Card title="Fake task generator">
                <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
                    Creates tasks due today across Biology/Calculus/History/Personal so they classify
                    as different label types — go to <code>/</code> and complete them to exercise the
                    real mascot/XP/growth/streak flow.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="number"
                        min={1}
                        max={20}
                        value={fakeTaskCount}
                        onChange={(event) => setFakeTaskCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                        className="w-16 rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
                    />
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

            <Card title="Live map/mascot preview (not persisted)">
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([
                        ["Currency", previewCurrency, setPreviewCurrency],
                        ["Library", previewLibrary, setPreviewLibrary],
                        ["Workshop", previewWorkshop, setPreviewWorkshop],
                        ["Training Grounds", previewTrainingGrounds, setPreviewTrainingGrounds],
                        ["Watchtower", previewWatchtower, setPreviewWatchtower],
                        ["Town Square", previewTownSquare, setPreviewTownSquare],
                        ["Streak", previewStreak, setPreviewStreak],
                    ] as Array<[string, number, (value: number) => void]>).map(([label, value, setValue]) => (
                        <label key={label} className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--muted)" }}>
                            {label}
                            <input
                                type="number"
                                value={value}
                                onChange={(event) => setValue(Number(event.target.value) || 0)}
                                className="rounded-md border px-2 py-1 text-xs"
                                style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--foreground)" }}
                            />
                        </label>
                    ))}
                </div>

                <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                    <WorldView townState={previewTownState} onOpenLaptop={() => {}} dialogue={null} />
                </div>

                <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
                    <Mascot dialogue={previewDialogue || null} />
                    <input
                        type="text"
                        value={previewDialogue}
                        onChange={(event) => setPreviewDialogue(event.target.value)}
                        placeholder="Custom dialogue text..."
                        className="w-full max-w-sm rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--foreground)" }}
                    />
                    <div className="flex flex-wrap justify-center gap-2">
                        {(["taskStart", "taskComplete", "announcementFound"] as MascotTrigger[]).map((trigger) => (
                            <button
                                key={trigger}
                                type="button"
                                onClick={() => setPreviewDialogue(pickLine(trigger))}
                                className="rounded-lg border px-3 py-1.5 text-xs font-bold transition-transform hover:scale-105"
                                style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                            >
                                Sample: {trigger}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setShowIntroPreview((current) => !current)}
                        className="rounded-lg border px-3 py-2 text-xs font-bold transition-transform hover:scale-105"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                    >
                        {showIntroPreview ? "Hide" : "Show"} onboarding intro preview
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowTourPreview((current) => !current)}
                        className="rounded-lg border px-3 py-2 text-xs font-bold transition-transform hover:scale-105"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--heading)" }}
                    >
                        {showTourPreview ? "Hide" : "Show"} onboarding tour preview
                    </button>
                </div>

                {showIntroPreview && (
                    <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                        <OnboardingOverlay phase="intro" onOpenLaptop={() => setShowIntroPreview(false)} />
                    </div>
                )}

                {showTourPreview && (
                    <OnboardingOverlay phase="tour" onComplete={() => setShowTourPreview(false)} />
                )}
            </Card>

            <Card title="Raw state">
                <pre
                    className="overflow-auto rounded-lg p-3 text-[11px]"
                    style={{ background: "var(--panel-muted)", color: "var(--foreground)" }}
                >
                    {JSON.stringify({ gamification, townState, generatedTaskIds }, null, 2)}
                </pre>
            </Card>
        </div>
    );
}
