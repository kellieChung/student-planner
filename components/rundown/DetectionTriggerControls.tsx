"use client";

import { useEffect, useRef, useState } from "react";
import { ProposedTask } from "@/types/proposedTask";
import DatePicker from "@/components/DatePicker";
import Checkbox from "@/components/ui/Checkbox";
import { DetectionQuota } from "@/types/aiQuota";
import { MAX_ANNOUNCEMENTS_PER_CHECK } from "@/lib/analysisLimits";
import Spinner from "@/components/Spinner";
import { getStartOfWeek, getTodayString, parseLocalDate } from "@/lib/utils";
import { useMascot } from "@/components/world/LaptopFrame";

// Pause is only checked between extraction batches, and a check is capped at
// MAX_ANNOUNCEMENTS_PER_CHECK, which equals Haiku's batch size — so a running
// check is always a single batch and Pause could never take effect. Hidden
// until pausing works mid-batch; the server side is left in place.
const PAUSE_AVAILABLE = false;

// Ports the manual "Check for new announcements" trigger from the retired
// components/AIReviewPanel.tsx: the range-preset picker, custom dates, dry-
// run preview, and the NDJSON-streaming call to
// /api/ai/analyze-announcements. Deliberately does NOT run automatically —
// AutoTaskCreation.md requires the AI detection pass (a real Anthropic/
// Ollama cost, rate-limited to 2/week) stay an explicit user action, never
// fired just by opening the Rundown. New candidates stream straight into
// the parent's pending list via onNewCandidates instead of a local
// one-at-a-time carousel queue. A running check can be paused (the server
// stops launching batches, finishes the in-flight ones) and resumed for free.
type DetectionTriggerControlsProps = {
    onNewCandidates: (tasks: ProposedTask[]) => void;
    onRunFinished?: () => void;
    // Lets the Rundown window ask before closing mid-check (closing aborts
    // the stream).
    onRunningChange?: (running: boolean) => void;
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

function newRunId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatResetDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

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

// The window as instants from the user's own local midnights, so the server
// (UTC on Vercel) never has to guess the user's calendar day. A null range is
// "this week" plus the early buffer, matching the server's default.
function rangeWindow(range: { from: string; to: string } | null): { windowStart: string; windowEnd: string } {
    let start: Date;
    let end: Date;

    if (range) {
        start = parseLocalDate(range.from);
        end = parseLocalDate(range.to);
    } else {
        const weekStart = getStartOfWeek();
        start = new Date(weekStart);
        start.setDate(start.getDate() - WEEKLY_POST_BUFFER_DAYS);
        end = new Date(weekStart);
        end.setDate(end.getDate() + 6);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

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
    onRunningChange,
}: DetectionTriggerControlsProps) {
    const [loading, setLoading] = useState(false);
    const [started, setStarted] = useState(false);
    const [progress, setProgress] = useState<AnalysisProgress | null>(null);
    const [emptyAnnouncements, setEmptyAnnouncements] = useState<AnnouncementResult[]>([]);
    const [newCandidateCount, setNewCandidateCount] = useState(0);
    const [streamIncomplete, setStreamIncomplete] = useState(false);
    const [rateLimitError, setRateLimitError] = useState<string | null>(null);
    const [quota, setQuota] = useState<DetectionQuota | null>(null);
    const [pausing, setPausing] = useState(false);
    const [paused, setPaused] = useState(false);
    const [inRangeCount, setInRangeCount] = useState(0);

    const [preset, setPreset] = useState<RangePreset>("thisWeek");
    const [customFrom, setCustomFrom] = useState(getTodayString());
    const [customTo, setCustomTo] = useState(getTodayString());
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [alreadyAnalyzedCount, setAlreadyAnalyzedCount] = useState(0);
    const [previewAnnouncements, setPreviewAnnouncements] = useState<PreviewAnnouncement[]>([]);
    const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
    const [selectionTouched, setSelectionTouched] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);

    const previewSeq = useRef(0);
    const runIdRef = useRef<string | null>(null);
    const lastBodyRef = useRef<Record<string, unknown>>({});
    const abortRef = useRef<AbortController | null>(null);
    const { say } = useMascot();

    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        onRunningChange?.(loading);
    }, [loading, onRunningChange]);

    function currentRange(): { from: string; to: string } | null {
        if (preset === "custom") {
            if (!customFrom || !customTo || customFrom > customTo) {
                return null;
            }

            return { from: customFrom, to: customTo };
        }

        return resolvePresetRange(preset);
    }

    async function loadPreview(range: { from: string; to: string } | null, seq: number) {
        setPreviewLoading(true);

        try {
            const response = await fetch("/api/ai/analyze-announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dryRun: true, ...(range ?? {}), ...rangeWindow(range) }),
            });

            const data = await response.json();

            if (seq === previewSeq.current && data.success) {
                setPreviewCount(data.announcementCount);
                setAlreadyAnalyzedCount(data.alreadyAnalyzedCount ?? 0);
                setInRangeCount(data.inRangeCount ?? data.announcementCount);
                setPreviewAnnouncements(data.preview ?? []);
                // The list is newest-first and a check covers at most
                // MAX_ANNOUNCEMENTS_PER_CHECK, so everything past that starts
                // unselected — exactly what the server would take on its own.
                setDeselectedIds(
                    new Set(
                        ((data.preview ?? []) as PreviewAnnouncement[])
                            .slice(MAX_ANNOUNCEMENTS_PER_CHECK)
                            .map((announcement) => announcement.id)
                    )
                );
                setSelectionTouched(false);

                if (data.quota) {
                    setQuota(data.quota);
                }
            }
        } catch (error) {
            console.error("Failed to preview announcement count:", error);
        } finally {
            if (seq === previewSeq.current) {
                setPreviewLoading(false);
            }
        }
    }

    useEffect(() => {
        if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
            return;
        }

        const range = currentRange();
        const seq = ++previewSeq.current;

        const timer = setTimeout(
            () => void loadPreview(range, seq),
            preset === "custom" ? 400 : 0
        );

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset, customFrom, customTo]);

    // After a run the list/count above is stale (those announcements are now
    // analyzed), and the quota has moved.
    function refreshPreview() {
        if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
            return;
        }

        void loadPreview(currentRange(), ++previewSeq.current);
    }

    function toggleAnnouncement(id: string) {
        // Can't tick past the per-check cap.
        if (
            deselectedIds.has(id) &&
            previewAnnouncements.length - deselectedIds.size >= MAX_ANNOUNCEMENTS_PER_CHECK
        ) {
            return;
        }

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

    async function runDetectionPass(mode: "check" | "regenerate" | "resume" = "check") {
        const range = currentRange();

        let body: Record<string, unknown>;

        if (mode === "resume") {
            // Same selection/range as the paused run, under its runId so the
            // server continues it without charging another check.
            body = { ...lastBodyRef.current, resumeRunId: runIdRef.current };
            delete body.runId;
            delete body.regenerate;
        } else {
            runIdRef.current = newRunId();

            // A regenerate re-runs everything in the range, so any
            // hand-picked subset of the *new* announcements doesn't apply.
            const scope =
                mode === "check" && selectionTouched
                    ? {
                          selectedAnnouncementIds: previewAnnouncements
                              .filter((a) => !deselectedIds.has(a.id))
                              .map((a) => a.id),
                      }
                    : { ...(range ?? {}), ...rangeWindow(range) };

            body = {
                ...scope,
                tzOffset: new Date().getTimezoneOffset(),
                runId: runIdRef.current,
                ...(mode === "regenerate" ? { regenerate: true } : {}),
            };

            lastBodyRef.current = body;
        }

        setLoading(true);
        setStarted(true);
        setPaused(false);
        setPausing(false);
        setStreamIncomplete(false);
        setRateLimitError(null);

        if (mode !== "resume") {
            setEmptyAnnouncements([]);
            setNewCandidateCount(0);
            setProgress(null);
        }

        let mascotFired = false;
        let receivedDone = false;
        let receivedPaused = false;

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetch("/api/ai/analyze-announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (response.status === 429) {
                const data = await response.json().catch(() => null);

                if (data?.quota) {
                    setQuota(data.quota);
                }

                setRateLimitError(data?.error ?? "You're out of announcement checks.");
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

                    if (frame.quota) {
                        setQuota(frame.quota);
                    }

                    if (frame.type === "start") {
                        setProgress((current) => ({
                            completed: mode === "resume" ? current?.completed ?? 0 : 0,
                            total:
                                mode === "resume"
                                    ? (current?.completed ?? 0) + frame.totalAnnouncements
                                    : frame.totalAnnouncements,
                        }));
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

                        // A resume's frame counts restart at 0; carry the
                        // paused run's finished count forward.
                        setProgress((current) => {
                            const base =
                                mode === "resume" && current
                                    ? current.total - frame.totalAnnouncements
                                    : 0;

                            return {
                                completed: base + frame.completedAnnouncements,
                                total: base + frame.totalAnnouncements,
                            };
                        });

                        if (!mascotFired && newTasks.length > 0) {
                            mascotFired = true;
                            say("announcementFound");
                        }
                    } else if (frame.type === "paused") {
                        receivedPaused = true;
                    } else if (frame.type === "done") {
                        receivedDone = true;
                    } else if (frame.type === "error") {
                        console.error("Announcement analysis stream error:", frame.message);
                    }
                }

                if (done) {
                    break;
                }
            }

            if (receivedPaused) {
                setPaused(true);
            } else if (!receivedDone) {
                setStreamIncomplete(true);
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                console.error("Failed to analyze announcements:", error);
                setStreamIncomplete(true);
            }
        } finally {
            setLoading(false);
            setPausing(false);
            onRunFinished?.();
            refreshPreview();
        }
    }

    async function pauseRun() {
        if (!runIdRef.current || pausing) {
            return;
        }

        setPausing(true);

        try {
            const response = await fetch("/api/ai/analyze-announcements/pause", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ runId: runIdRef.current }),
            });

            if (!response.ok) throw new Error(`Pause returned ${response.status}`);
        } catch (error) {
            console.error("Failed to pause announcement analysis:", error);
            setPausing(false);
        }
    }

    function stopPausedRun() {
        setPaused(false);
        setStarted(false);
        setProgress(null);
    }

    const finished =
        started && !loading && !paused && !streamIncomplete && !rateLimitError;

    const rangeIsInvalid =
        preset === "custom" && (!customFrom || !customTo || customFrom > customTo);

    const outOfChecks = quota !== null && quota.remaining <= 0;

    const nothingNew = previewCount === 0;

    const canAnalyze =
        !rangeIsInvalid &&
        !outOfChecks &&
        previewCount !== 0 &&
        !(selectionTouched && selectedCount === 0);

    const canRegenerate = !rangeIsInvalid && !outOfChecks && inRangeCount > 0;

    // Only offered when there's something already checked to redo — with
    // everything new, the main button already covers the whole range.
    const showRegenerate = !rangeIsInvalid && inRangeCount > 0 && alreadyAnalyzedCount > 0;

    return (
        <div>
            {!loading && !paused && (
                <div className="theme-surface rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        Announcements to check
                    </p>

                    <QuotaBanner quota={quota} />

                    <p className="mb-3 text-xs text-[var(--muted)]">
                        Works best on English announcements — suggestions from other languages may be less accurate, so double-check them.
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
                            <DatePicker
                                value={customFrom}
                                onChange={setCustomFrom}
                                ariaLabel="From date"
                                className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)]"
                            />

                            <span className="text-xs text-[var(--muted)]">to</span>

                            <DatePicker
                                value={customTo}
                                onChange={setCustomTo}
                                ariaLabel="To date"
                                className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)]"
                            />

                            {rangeIsInvalid && (
                                <span className="text-xs text-red-400">
                                    Pick a valid start/end date.
                                </span>
                            )}
                        </div>
                    )}

                    {previewAnnouncements.length > MAX_ANNOUNCEMENTS_PER_CHECK && (
                        <p className="mb-2 text-xs text-amber-400">
                            {previewAnnouncements.length} new announcements in this range, but a check covers at most {MAX_ANNOUNCEMENTS_PER_CHECK} (newest first). {selectedCount} of {MAX_ANNOUNCEMENTS_PER_CHECK} selected — pick different ones below or narrow the range. The rest stay waiting for your next check.
                        </p>
                    )}

                    {previewAnnouncements.length > 0 && (
                        <div className="mb-3 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)]">
                            {previewAnnouncements.map((announcement) => (
                                <label
                                    key={announcement.id}
                                    className="flex cursor-pointer items-start gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--border)]/20"
                                >
                                    <Checkbox
                                        checked={!deselectedIds.has(announcement.id)}
                                        disabled={
                                            deselectedIds.has(announcement.id) &&
                                            selectedCount >= MAX_ANNOUNCEMENTS_PER_CHECK
                                        }
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

                    {rateLimitError && (
                        <p className="mb-3 text-xs text-[var(--status-overdue-text)]">
                            {rateLimitError}
                        </p>
                    )}

                    {nothingNew && !rangeIsInvalid && (
                        <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--border)]/20 p-3">
                            <p className="text-sm font-semibold">
                                {inRangeCount > 0
                                    ? "No new announcements in this range"
                                    : "No announcements in this range"}
                            </p>

                            {inRangeCount > 0 && (
                                <p className="mt-1 text-xs text-[var(--muted)]">
                                    All {inRangeCount} announcement{inRangeCount === 1 ? " has" : "s have"} already been checked. You can re-check them if you want fresh results.
                                </p>
                            )}
                        </div>
                    )}

                    {!nothingNew && (
                        <button
                            onClick={() => void runDetectionPass("check")}
                            disabled={!canAnalyze}
                            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {previewLoading && previewCount === null && <Spinner className="h-4 w-4" />}

                            {outOfChecks
                                ? "Out of checks"
                                : rangeIsInvalid
                                ? "Check for new announcements"
                                : selectionTouched && selectedCount === 0
                                ? "Select at least one announcement"
                                : previewCount === null
                                ? "Check for new announcements"
                                : selectionTouched
                                ? `Check ${selectedCount} announcement${selectedCount === 1 ? "" : "s"}`
                                : previewCount > MAX_ANNOUNCEMENTS_PER_CHECK
                                ? `Check the newest ${MAX_ANNOUNCEMENTS_PER_CHECK} of ${previewCount} new announcements`
                                : `Check ${previewCount} new announcement${previewCount === 1 ? "" : "s"}`}
                        </button>
                    )}

                    {showRegenerate && (
                        <button
                            onClick={() => void runDetectionPass("regenerate")}
                            disabled={!canRegenerate}
                            className={`flex items-center gap-2 rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-semibold transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
                                nothingNew ? "" : "mt-2"
                            }`}
                        >
                            {inRangeCount > MAX_ANNOUNCEMENTS_PER_CHECK
                                ? `Re-check the newest ${MAX_ANNOUNCEMENTS_PER_CHECK} of ${inRangeCount} in this range`
                                : `Re-check all ${inRangeCount} in this range`}
                        </button>
                    )}

                    {(!nothingNew || showRegenerate) && !outOfChecks && (
                        <p className="mt-2 text-xs text-[var(--muted)]">
                            Each check uses 1 of your checks.
                        </p>
                    )}
                </div>
            )}

            {loading && (
                <div className="theme-surface mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
                    <QuotaBanner quota={quota} />

                    <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-2 font-semibold">
                            <Spinner className="h-4 w-4" />
                            {pausing ? "Pausing" : "Checking announcements"}
                            {progress ? `... ${progress.completed} of ${progress.total}` : "..."}
                        </p>

                        {PAUSE_AVAILABLE && (
                            <button
                                type="button"
                                onClick={() => void pauseRun()}
                                disabled={pausing || !progress}
                                className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Pause
                            </button>
                        )}
                    </div>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        {pausing
                            ? "Finishing the announcements already in progress, then stopping."
                            : "New suggestions appear in \"AI found these\" as each batch finishes."}
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

            {paused && !loading && (
                <div className="theme-surface mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                    <QuotaBanner quota={quota} />

                    <p className="font-semibold">
                        Paused
                        {progress ? ` — ${progress.completed} of ${progress.total} checked` : ""}
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        {newCandidateCount > 0
                            ? `${newCandidateCount} suggestion${newCandidateCount === 1 ? "" : "s"} found so far are listed in "AI found these". `
                            : ""}
                        Resuming picks up where it stopped and doesn&apos;t use another check.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void runDetectionPass("resume")}
                            className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                        >
                            Resume
                        </button>

                        <button
                            type="button"
                            onClick={stopPausedRun}
                            className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold transition hover:border-[var(--accent)]"
                        >
                            Stop
                        </button>
                    </div>
                </div>
            )}

            {started && !loading && streamIncomplete && (
                <div className="theme-surface mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                    <p className="font-semibold text-[var(--status-overdue-text)]">
                        Check stopped early
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        The connection dropped before every announcement could be checked. Suggestions already found are safe — resume to cover the rest without using another check.
                    </p>

                    <button
                        type="button"
                        onClick={() => void runDetectionPass("resume")}
                        className="mt-3 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                    >
                        Resume
                    </button>
                </div>
            )}

            {finished && (
                <div className="theme-surface mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                    <p className="text-xl font-bold">
                        {newCandidateCount > 0
                            ? `Found ${newCandidateCount} new suggestion${newCandidateCount === 1 ? "" : "s"}`
                            : "You're all caught up!"}
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

function QuotaBanner({ quota }: { quota: DetectionQuota | null }) {
    if (!quota) {
        return null;
    }

    const outOfChecks = quota.remaining <= 0;

    return (
        <div
            className={`mb-3 rounded-xl border p-3 ${
                outOfChecks
                    ? "border-[var(--status-overdue-text)]/40"
                    : "border-[var(--border)] bg-[var(--border)]/20"
            }`}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                    Announcement checks this week:{" "}
                    <span className={outOfChecks ? "text-[var(--status-overdue-text)]" : ""}>
                        {quota.weeklyRemaining} of {quota.limit} left
                    </span>
                    {quota.credits > 0 && (
                        <span className="text-[var(--accent)]">
                            {" "}
                            + {quota.credits} bonus
                        </span>
                    )}
                </p>

                <div className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: quota.limit }, (_, i) => (
                        <span
                            key={i}
                            className={`h-2.5 w-2.5 rounded-full border ${
                                i < quota.weeklyRemaining
                                    ? "border-[var(--accent)] bg-[var(--accent)]"
                                    : "border-[var(--border)]"
                            }`}
                        />
                    ))}
                </div>
            </div>

            <p className="mt-1 text-xs font-semibold">
                Each check analyzes up to {MAX_ANNOUNCEMENTS_PER_CHECK} announcements.
            </p>

            <p className="mt-1 text-xs text-[var(--muted)]">
                {outOfChecks
                    ? quota.resetsAt
                        ? `You're out of checks. The next one frees up ${formatResetDate(quota.resetsAt)}.`
                        : "You're out of checks."
                    : quota.resetsAt
                    ? `Your next check frees up ${formatResetDate(quota.resetsAt)}.`
                    : "Checks refill on a rolling 7-day basis."}
            </p>
        </div>
    );
}
