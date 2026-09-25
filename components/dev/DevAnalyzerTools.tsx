"use client";

import Checkbox from "@/components/ui/Checkbox";
import { useState } from "react";

type ResetResult = {
    announcementsReset: number;
    reviewsDeleted: number;
    weeklyRunsCleared: number;
};

// Re-testing the announcement analyzer on your own account. Without this,
// every announcement that was ever analyzed is skipped ("no new
// announcements") and every accepted/rejected candidate stays decided, so
// the duplicate checker never gets exercised twice.
export default function DevAnalyzerTools() {
    const [clearWeeklyUsage, setClearWeeklyUsage] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ResetResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function reset() {
        setBusy(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch("/api/dev/analyzer-reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clearWeeklyUsage }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error ?? "Reset failed.");
            }

            setResult(data);
        } catch (resetError) {
            setError(resetError instanceof Error ? resetError.message : "Reset failed.");
        } finally {
            setBusy(false);
            setConfirming(false);
        }
    }

    return (
        <div className="theme-surface rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <p className="text-lg font-bold">Reset analyzer state (your account only)</p>

            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                Forgets which announcements were already checked and deletes every AI suggestion
                decision (pending, accepted, rejected, maybe), so the next check runs the whole
                pipeline — extraction and duplicate check — again. Tasks you already added to the
                planner stay, and since the duplicate check only compares against Canvas assignments,
                re-checking can suggest those again as &quot;no duplicate&quot;.
            </p>

            <label className="mt-4 flex items-center gap-2 text-sm">
                <Checkbox checked={clearWeeklyUsage} onChange={setClearWeeklyUsage} />
                Also clear this week&apos;s used checks (credits are kept)
            </label>

            <div className="mt-4 flex items-center gap-2">
                {!confirming ? (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold transition hover:border-[var(--accent)]"
                    >
                        Reset analyzer state
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void reset()}
                            className="rounded-xl bg-[var(--status-overdue-text)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {busy ? "Resetting…" : "Yes, reset it"}
                        </button>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                            className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold"
                        >
                            Cancel
                        </button>
                    </>
                )}
            </div>

            {error && <p className="mt-3 text-sm text-[var(--status-overdue-text)]">{error}</p>}

            {result && (
                <p className="mt-3 text-sm text-[var(--muted)]">
                    Reset {result.announcementsReset} announcement(s), deleted {result.reviewsDeleted}{" "}
                    decision(s)
                    {result.weeklyRunsCleared > 0 ? `, cleared ${result.weeklyRunsCleared} weekly check(s)` : ""}.
                    Reload the planner to clear stale cards from the Rundown.
                </p>
            )}
        </div>
    );
}
