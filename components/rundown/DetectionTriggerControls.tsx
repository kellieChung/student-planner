"use client";

import { useEffect, useRef, useState } from "react";
import { ProposedTask } from "@/types/proposedTask";
import Spinner from "@/components/Spinner";
import { getStartOfWeek, getTodayString } from "@/lib/utils";
import { useMascot } from "@/components/world/LaptopFrame";

// Ports the manual "Check for new announcements" trigger from the retired
// components/AIReviewPanel.tsx: the range-preset picker, custom dates, dry-
// run preview, and the NDJSON-streaming call to
// /api/ai/analyze-announcements. Deliberately does NOT run automatically —
// AutoTaskCreation.md requires the AI detection pass (a real Anthropic/
// Ollama cost, rate-limited to 2/week) stay an explicit user action, never
// fired just by opening the Rundown. New candidates stream straight into
// the parent's pending list via onNewCandidates instead of a local
// one-at-a-time carousel queue.
type DetectionTriggerControlsProps = {
    onNewCandidates: (tasks: ProposedTask[]) => void;
    onRunFinished?: () => void;
};

type RangePreset = "thisWeek" | "thisAndLastWeek" | "last30Days" | "custom";

type PreviewAnnouncement = {
    id: string;
    title: string;
    course: string;
    postedAt: string;
};

type AnnouncementResult = {
    announcement: {
        id: string;
        title: string;
        course: string;
        postedAt: string;
        message: string;
    };
    tasks: ProposedTask[];
    error?: string;
};

type AnalysisProgress = {
    completed: number;
    total: number;
};

// A lot to review in one sitting, and — now that extraction runs on the
// Anthropic API — a lot of real per-batch cost. Not a hard cap, just a
// nudge toward narrowing the range.
const LARGE_RANGE_WARNING_THRESHOLD = 15;

function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// Mirrors app/api/ai/analyze-announcements/route.ts's ANNOUNCEMENT_BUFFER_
// DAYS (4) for the "this + last week" preset's older boundary. "thisWeek"
// deliberately sends no from/to at all so the server stays the single
// source of truth for the default range.
const WEEKLY_POST_BUFFER_DAYS = 4;

function resolvePresetRange(
    preset: RangePreset
): { from: string; to: string } | null {
    if (preset === "thisWeek") {
        return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (preset === "last30Days") {
        const from = new Date(today);
        from.setDate(from.getDate() - 29);

        return { from: formatLocalDate(from), to: formatLocalDate(today) };
    }

    if (preset === "thisAndLastWeek") {
        const weekStart = getStartOfWeek(today);

        const from = new Date(weekStart);
        from.setDate(from.getDate() - 7 - WEEKLY_POST_BUFFER_DAYS);

        const to = new Date(weekStart);
        to.setDate(to.getDate() + 6);

        return { from: formatLocalDate(from), to: formatLocalDate(to) };
    }

    return null;
}

export default function DetectionTriggerControls({
    onNewCandidates,
    onRunFinished,
}: DetectionTriggerControlsProps) {
    const [loading, setLoading] = useState(false);
    const [started, setStarted] = useState(false);
    const [progress, setProgress] = useState<AnalysisProgress | null>(null);
    const [emptyAnnouncements, setEmptyAnnouncements] = useState<AnnouncementResult[]>([]);
    const [newCandidateCount, setNewCandidateCount] = useState(0);
    const [streamIncomplete, setStreamIncomplete] = useState(false);
    const [rateLimitError, setRateLimitError] = useState<string | null>(null);

    const [preset, setPreset] = useState<RangePreset>("thisWeek");
    const [customFrom, setCustomFrom] = useState(getTodayString());
    const [customTo, setCustomTo] = useState(getTodayString());
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [previewAnnouncements, setPreviewAnnouncements] = useState<PreviewAnnouncement[]>([]);
    const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
    const [selectionTouched, setSelectionTouched] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);

    const previewSeq = useRef(0);
    const { say } = useMascot();

    function currentRange(): { from: string; to: string } | null {
        if (preset === "custom") {
            if (!customFrom || !customTo || customFrom > customTo) {
                return null;
            }

            return { from: customFrom, to: customTo };
        }

        return resolvePresetRange(preset);
    }

    useEffect(() => {
        if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
            return;
        }

        const range = currentRange();
        const seq = ++previewSeq.current;

        const timer = setTimeout(
            async () => {
                setPreviewLoading(true);

                try {
                    const response = await fetch("/api/ai/analyze-announcements", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dryRun: true, ...(range ?? {}) }),
                    });

                    const data = await response.json();

                    if (seq === previewSeq.current && data.success) {
                        setPreviewCount(data.announcementCount);
                        setPreviewAnnouncements(data.preview ?? []);
                        setDeselectedIds(new Set());
                        setSelectionTouched(false);
                    }
                } catch (error) {
                    console.error("❌ Failed to preview announcement count:", error);
                } finally {
                    if (seq === previewSeq.current) {
                        setPreviewLoading(false);
                    }
                }
            },
            preset === "custom" ? 400 : 0
        );

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset, customFrom, customTo]);

    function toggleAnnouncement(id: string) {
        setSelectionTouched(true);

        setDeselectedIds((current) => {
            const next = new Set(current);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    const selectedCount = previewAnnouncements.length - deselectedIds.size;

    async function runDetectionPass() {
        setLoading(true);
        setStarted(true);
        setEmptyAnnouncements([]);
        setNewCandidateCount(0);
        setProgress(null);
        setStreamIncomplete(false);
        setRateLimitError(null);

        const range = currentRange();

        const body = selectionTouched
            ? {
                  selectedAnnouncementIds: previewAnnouncements
                      .filter((a) => !deselectedIds.has(a.id))
                      .map((a) => a.id),
              }
            : range ?? {};

        let mascotFired = false;
        let receivedDone = false;

        try {
            const response = await fetch("/api/ai/analyze-announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (response.status === 429) {
                const data = await response.json().catch(() => null);
                setRateLimitError(
                    data?.error ?? "You've used your 2 checks for this week."
                );
                return;
            }

            if (!response.ok || !response.body) {
                throw new Error("Failed to analyze announcements.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();

                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                }

                let newlineIndex;

                while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    if (!line) {
                        continue;
                    }

                    const frame = JSON.parse(line);

                    if (frame.type === "start") {
                        setProgress({ completed: 0, total: frame.totalAnnouncements });
                    } else if (frame.type === "batch") {
                        const batchResults = frame.results as AnnouncementResult[];

                        const newTasks = batchResults.flatMap((result) => result.tasks);

                        if (newTasks.length > 0) {
                            onNewCandidates(newTasks);
                            setNewCandidateCount((count) => count + newTasks.length);
                        }

                        setEmptyAnnouncements((current) => [
                            ...current,
                            ...batchResults.filter((result) => result.tasks.length === 0),
                        ]);

                        setProgress({
                            completed: frame.completedAnnouncements,
                            total: frame.totalAnnouncements,
                        });

                        if (!mascotFired && newTasks.length > 0) {
                            mascotFired = true;
                            say("announcementFound");
                        }
                    } else if (frame.type === "done") {
                        receivedDone = true;
                    } else if (frame.type === "error") {
                        console.error("❌ Announcement analysis stream error:", frame.message);
                    }
                }

                if (done) {
                    break;
                }
            }

            if (!receivedDone) {
                setStreamIncomplete(true);
            }
        } catch (error) {
            console.error("❌ Failed to analyze announcements:", error);
            setStreamIncomplete(true);
        } finally {
            setLoading(false);
            onRunFinished?.();
        }
    }

    const finished = started && !loading && !streamIncomplete && !rateLimitError;

    const rangeIsInvalid =
        preset === "custom" && (!customFrom || !customTo || customFrom > customTo);

    const canAnalyze =
        !rangeIsInvalid &&
        previewCount !== 0 &&
        !(selectionTouched && selectedCount === 0);

    return (
        <div>
            {!loading && (
                <div className="theme-surface rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        Announcements to check
                    </p>

                    <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-[var(--border)]/30 p-1">
                        {(
                            [
                                { key: "thisWeek", label: "This week" },
                                { key: "thisAndLastWeek", label: "This week + last week" },
                                { key: "last30Days", label: "Last 30 days" },
                                { key: "custom", label: "Custom range" },
                            ] as { key: RangePreset; label: string }[]
                        ).map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => setPreset(option.key)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    preset === option.key
                                        ? "bg-[var(--accent)] text-white"
                                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {preset === "custom" && (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
                            />

                            <span className="text-xs text-[var(--muted)]">to</span>

                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
                            />

                            {rangeIsInvalid && (
                                <span className="text-xs text-red-400">
                                    Pick a valid start/end date.
                                </span>
                            )}
                        </div>
                    )}

                    {previewAnnouncements.length > 0 && (
                        <div className="mb-3 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)]">
                            {previewAnnouncements.map((announcement) => (
                                <label
                                    key={announcement.id}
                                    className="flex cursor-pointer items-start gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--border)]/20"
                                >
                                    <input
                                        type="checkbox"
                                        checked={!deselectedIds.has(announcement.id)}
                                        onChange={() => toggleAnnouncement(announcement.id)}
                                        className="mt-1"
                                    />

                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">
                                            {announcement.title}
                                        </p>

                                        <p className="text-xs text-[var(--muted)]">
                                            {announcement.course}
                                            {announcement.postedAt &&
                                                ` · ${new Date(announcement.postedAt).toLocaleDateString()}`}
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}

                    {previewCount !== null && previewCount > LARGE_RANGE_WARNING_THRESHOLD && (
                        <p className="mb-3 text-xs text-amber-400">
                            That&apos;s a lot to review at once and will use more AI calls — consider narrowing the range.
                        </p>
                    )}

                    {rateLimitError && (
                        <p className="mb-3 text-xs text-[var(--status-overdue-text)]">
                            {rateLimitError}
                        </p>
                    )}

                    <button
                        onClick={runDetectionPass}
                        disabled={!canAnalyze}
                        className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {previewLoading && previewCount === null && <Spinner className="h-4 w-4" />}

                        {rangeIsInvalid
                            ? "🤖 Check for new announcements"
                            : selectionTouched && selectedCount === 0
                            ? "Select at least one announcement"
                            : previewCount === null
                            ? "🤖 Check for new announcements"
                            : previewCount === 0
                            ? "No announcements in this range"
                            : selectionTouched
                            ? `🤖 Check ${selectedCount} announcement${selectedCount === 1 ? "" : "s"}`
                            : `🤖 Check ${previewCount} announcement${previewCount === 1 ? "" : "s"}`}
                    </button>
                </div>
            )}

            {loading && (
                <div className="theme-surface mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
                    <p className="flex items-center gap-2 font-semibold">
                        <Spinner className="h-4 w-4" />
                        🤖 Checking announcements
                        {progress ? `... ${progress.completed} of ${progress.total}` : "..."}
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        New suggestions appear in &quot;AI found these&quot; as each batch finishes.
                    </p>

                    {progress && (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]/30">
                            <div
                                className="h-full rounded-full bg-[var(--accent)] transition-all"
                                style={{
                                    width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {started && !loading && streamIncomplete && (
                <div className="theme-surface mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                    <p className="font-semibold text-[var(--status-overdue-text)]">
                        ⚠️ Check stopped early
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        The connection dropped before every announcement could be checked. Suggestions already found are safe — try checking again to cover the rest.
                    </p>
                </div>
            )}

            {finished && (
                <div className="theme-surface mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                    <p className="text-xl font-bold">
                        {newCandidateCount > 0
                            ? `🎉 Found ${newCandidateCount} new suggestion${newCandidateCount === 1 ? "" : "s"}`
                            : "🎉 You're all caught up!"}
                    </p>

                    <p className="mt-2 text-sm text-[var(--muted)]">
                        {newCandidateCount > 0
                            ? "New suggestions are listed in \"AI found these\" above."
                            : "The AI didn't find any new work in these announcements."}
                    </p>

                    {emptyAnnouncements.length > 0 && (
                        <div className="mt-4 border-t border-[var(--border)] pt-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                                Checked, nothing to do
                            </p>

                            <ul className="mt-2 space-y-1">
                                {emptyAnnouncements.map((result) => (
                                    <li key={result.announcement.id} className="text-sm text-[var(--muted)]">
                                        {result.announcement.title} — {result.announcement.course}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
