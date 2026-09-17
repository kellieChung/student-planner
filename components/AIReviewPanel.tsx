"use client";

import { useEffect, useRef, useState } from "react";
import { ProposedTask } from "@/types/proposedTask";
import { Course } from "@/types/course";
import AIReviewCard from "@/components/AIReviewCard";
import { Assignment } from "@/types/assignment";
import Spinner from "@/components/Spinner";
import { getStartOfWeek, getTodayString } from "@/lib/utils";
import { useMascot } from "@/components/world/LaptopFrame";

type AIReviewPanelProps = {
    courses: Course[];
    onCourseCreated: (course: Course) => void;
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
// DAYS (4) for the "this + last week" preset's older boundary, so the
// "announcements post by the Wednesday before" heuristic still holds for
// the earlier week too. "thisWeek" deliberately does NOT duplicate the
// server's default window math — it sends no from/to at all so the server
// stays the single source of truth for the default range.
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
        // Sunday-start, matching lib/utils.ts's getStartOfWeek (the same
        // convention the planner grid itself uses for "this week") — not
        // a Monday-based re-derivation, which previously disagreed with it.
        const weekStart = getStartOfWeek(today);

        const from = new Date(weekStart);
        from.setDate(from.getDate() - 7 - WEEKLY_POST_BUFFER_DAYS);

        const to = new Date(weekStart);
        to.setDate(to.getDate() + 6);

        return { from: formatLocalDate(from), to: formatLocalDate(to) };
    }

    return null;
}

export default function AIReviewPanel({ courses, onCourseCreated }: AIReviewPanelProps) {
    const [results, setResults] = useState<AnnouncementResult[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [started, setStarted] = useState(false);
    const [progress, setProgress] = useState<AnalysisProgress | null>(null);

    // True only if the stream ended (network drop, server crash, etc.)
    // without ever sending a "done" frame — distinct from a clean finish,
    // so a truncated analysis doesn't render the same "all caught up"
    // screen as a genuinely complete one.
    const [streamIncomplete, setStreamIncomplete] = useState(false);

    const [preset, setPreset] = useState<RangePreset>("thisWeek");
    const [customFrom, setCustomFrom] = useState(getTodayString());
    const [customTo, setCustomTo] = useState(getTodayString());
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [previewAnnouncements, setPreviewAnnouncements] = useState<
        PreviewAnnouncement[]
    >([]);
    const [deselectedIds, setDeselectedIds] = useState<Set<string>>(
        new Set()
    );
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
        // Invalid custom range: skip fetching. No setState here — the
        // label/disabled state already fall back to `rangeIsInvalid`
        // independent of a possibly-stale previewCount (see the render
        // logic below), so there's nothing to reset synchronously.
        if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
            return;
        }

        const range = currentRange();
        const seq = ++previewSeq.current;

        const timer = setTimeout(
            async () => {
                setPreviewLoading(true);

                try {
                    const response = await fetch(
                        "/api/ai/analyze-announcements",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                dryRun: true,
                                ...(range ?? {}),
                            }),
                        }
                    );

                    const data = await response.json();

                    if (seq === previewSeq.current && data.success) {
                        setPreviewCount(data.announcementCount);
                        setPreviewAnnouncements(data.preview ?? []);
                        setDeselectedIds(new Set());
                        setSelectionTouched(false);
                    }
                } catch (error) {
                    console.error(
                        "❌ Failed to preview announcement count:",
                        error
                    );
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

    async function analyzeAnnouncements() {
        setLoading(true);
        setStarted(true);
        setResults([]);
        setCurrentIndex(0);
        setProgress(null);
        setStreamIncomplete(false);

        const range = currentRange();

        const body =
            selectionTouched
                ? {
                      selectedAnnouncementIds: previewAnnouncements
                          .filter((a) => !deselectedIds.has(a.id))
                          .map((a) => a.id),
                  }
                : range ?? {};

        let mascotFired = false;
        let receivedDone = false;

        try {
            const response = await fetch(
                "/api/ai/analyze-announcements",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }
            );

            if (!response.ok || !response.body) {
                throw new Error("Failed to analyze announcements.");
            }

            // The route streams one NDJSON frame per line (a "start", one
            // "batch" per resolved batch, a final "done") instead of one
            // JSON body — this is what lets suggestions from the first
            // batch show up for review before later batches finish. A
            // batch frame can carry tens of KB (full announcement HTML,
            // matched-assignment descriptions), so a frame can legitimately
            // split across two reader.read() calls — buffer and only parse
            // complete lines, keeping any trailing partial line for the
            // next chunk.
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

                        setResults((current) => [...current, ...batchResults]);
                        setProgress({
                            completed: frame.completedAnnouncements,
                            total: frame.totalAnnouncements,
                        });

                        if (
                            !mascotFired &&
                            batchResults.some((result) => result.tasks.length > 0)
                        ) {
                            mascotFired = true;
                            say("announcementFound");
                        }
                    } else if (frame.type === "done") {
                        receivedDone = true;
                    } else if (frame.type === "error") {
                        console.error(
                            "❌ Announcement analysis stream error:",
                            frame.message
                        );
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
            console.error(
                "❌ Failed to analyze announcements:",
                error
            );
            setStreamIncomplete(true);
        } finally {
            setLoading(false);
        }
    }

    function nextTask() {
        setCurrentIndex((index) => index + 1);
    }

    function saveSuggestionReview(
        task: ProposedTask,
        status: "accepted" | "rejected"
    ) {
        // Fire-and-forget: a failed write shouldn't block the review
        // flow, at worst causing one stale resurfacing later.
        fetch("/api/ai/suggestion-review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sourceAnnouncementId: task.sourceAnnouncementId,
                suggestionKey: task.suggestionKey,
                status,
            }),
        }).catch((error) => {
            console.error(
                "❌ Failed to save suggestion review:",
                error
            );
        });
    }

    const queue = results.flatMap((result) => result.tasks);

    function handleAccept(updatedTask?: ProposedTask) {
        const acceptedTask =
            updatedTask ?? queue[currentIndex];

        if (!acceptedTask) {
            return;
        }

        /*
         * Convert the AI task into the same Assignment shape
         * used by the planner.
         */
        const plannerTask: Assignment = {
            id: `custom-ai-${Date.now()}-${currentIndex}`,
            name: acceptedTask.name,
            course: acceptedTask.course,
            due: acceptedTask.due ?? "",
            completed: false,
            sourceAnnouncementId: acceptedTask.sourceAnnouncementId,
            typeOverride: acceptedTask.typeOverride ?? undefined,
        };

        console.log(
            "✅ Accepted AI task:",
            plannerTask
        );

        /*
         * Tell WeeklyPlannerView to add this task.
         *
         * The planner is responsible for actually adding the
         * task to its state and saving it to localStorage.
         */
        window.dispatchEvent(
            new CustomEvent<Assignment>(
                "planner:add-task",
                {
                    detail: plannerTask,
                }
            )
        );

        saveSuggestionReview(acceptedTask, "accepted");

        nextTask();
    }

    function handleReject() {
        const rejectedTask = queue[currentIndex];

        if (rejectedTask) {
            saveSuggestionReview(rejectedTask, "rejected");
        }

        nextTask();
    }

    const currentTask = queue[currentIndex];

    const currentGroup = currentTask
        ? results.find(
              (result) =>
                  result.announcement.id ===
                  currentTask.sourceAnnouncementId
          )
        : undefined;

    const previousTask = currentIndex > 0 ? queue[currentIndex - 1] : undefined;

    const showGroupHeader =
        !!currentTask &&
        (!previousTask ||
            previousTask.sourceAnnouncementId !==
                currentTask.sourceAnnouncementId);

    const emptyAnnouncements = results.filter(
        (result) => result.tasks.length === 0
    );

    const finished =
        started &&
        !loading &&
        !streamIncomplete &&
        queue.length > 0 &&
        currentIndex >= queue.length;

    const rangeIsInvalid =
        preset === "custom" &&
        (!customFrom || !customTo || customFrom > customTo);

    // Disabled on a known-empty/invalid range, or once the user has
    // deselected every previewed announcement — if the preview fetch is
    // still loading or failed silently, previewCount stays null and the
    // button stays clickable (falls back to the plain "Review AI
    // Suggestions" label) rather than getting stuck disabled forever.
    const canAnalyze =
        !rangeIsInvalid &&
        previewCount !== 0 &&
        !(selectionTouched && selectedCount === 0);

    return (
        <div className="mt-8">
            {!started && (
                <div className="theme-surface rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        Announcements to analyze
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
                                                ` · ${new Date(
                                                    announcement.postedAt
                                                ).toLocaleDateString()}`}
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}

                    {previewCount !== null &&
                        previewCount > LARGE_RANGE_WARNING_THRESHOLD && (
                            <p className="mb-3 text-xs text-amber-400">
                                That&apos;s a lot to review at once and will
                                use more AI calls — consider narrowing the
                                range.
                            </p>
                        )}

                    <button
                        onClick={analyzeAnnouncements}
                        disabled={!canAnalyze}
                        className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {previewLoading && previewCount === null && (
                            <Spinner className="h-4 w-4" />
                        )}

                        {rangeIsInvalid
                            ? "🤖 Review AI Suggestions"
                            : selectionTouched && selectedCount === 0
                            ? "Select at least one announcement"
                            : previewCount === null
                            ? "🤖 Review AI Suggestions"
                            : previewCount === 0
                            ? "No announcements in this range"
                            : selectionTouched
                            ? `🤖 Analyze ${selectedCount} announcement${selectedCount === 1 ? "" : "s"}`
                            : `🤖 Analyze ${previewCount} announcement${previewCount === 1 ? "" : "s"}`}
                    </button>
                </div>
            )}

            {loading && (
                <div className="theme-surface mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
                    <p className="flex items-center gap-2 font-semibold">
                        <Spinner className="h-4 w-4" />
                        🤖 Analyzing announcements
                        {progress ? `... ${progress.completed} of ${progress.total}` : "..."}
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        {progress
                            ? "New suggestions appear below as each batch finishes."
                            : "Reading through your Canvas announcements."}
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

            {loading && !currentTask && results.length > 0 && (
                <div className="theme-surface mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
                    <p className="text-sm text-[var(--muted)]">
                        You&apos;re caught up on what&apos;s arrived so far —
                        still analyzing the rest.
                    </p>
                </div>
            )}

            {currentTask && (
                <div>
                    {showGroupHeader && currentGroup && (
                        <p className="mb-2 text-sm font-semibold">
                            From: {currentGroup.announcement.title} —{" "}
                            {currentGroup.announcement.course} ·{" "}
                            {currentGroup.tasks.length} suggestion
                            {currentGroup.tasks.length === 1 ? "" : "s"}
                        </p>
                    )}

                    <p className="mb-3 text-sm text-[var(--muted)]">
                        Suggestion{" "}
                        {currentIndex + 1} of{" "}
                        {queue.length}
                    </p>

                    <AIReviewCard
                        key={currentTask.suggestionKey}
                        task={currentTask}
                        courses={courses}
                        onCourseCreated={onCourseCreated}
                        onAccept={handleAccept}
                        onReject={handleReject}
                    />
                </div>
            )}

            {started && !loading && streamIncomplete && (
                <div className="theme-surface rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                    <p className="font-semibold text-[var(--status-overdue-text)]">
                        ⚠️ Analysis stopped early
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        The connection dropped before every announcement
                        could be checked. Suggestions already shown above are
                        safe to review — try analyzing again to check the
                        rest.
                    </p>
                </div>
            )}

            {finished && (
                <div className="theme-surface rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                    <p className="text-xl font-bold">
                        🎉 You&apos;re all caught up!
                    </p>

                    <p className="mt-2 text-sm text-[var(--muted)]">
                        You&apos;ve reviewed all of the AI
                        suggestions.
                    </p>

                    {emptyAnnouncements.length > 0 && (
                        <div className="mt-4 border-t border-[var(--border)] pt-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                                Checked, nothing to do
                            </p>

                            <ul className="mt-2 space-y-1">
                                {emptyAnnouncements.map((result) => (
                                    <li
                                        key={result.announcement.id}
                                        className="text-sm text-[var(--muted)]"
                                    >
                                        {result.announcement.title} —{" "}
                                        {result.announcement.course}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {started &&
                !loading &&
                !streamIncomplete &&
                queue.length === 0 && (
                    <div className="theme-surface rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                        <p className="font-semibold">
                            No tasks found!
                        </p>

                        <p className="mt-1 text-sm text-[var(--muted)]">
                            The AI didn&apos;t find any work in
                            your announcements.
                        </p>

                        {emptyAnnouncements.length > 0 && (
                            <div className="mt-4 border-t border-[var(--border)] pt-4">
                                <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                                    Announcements checked
                                </p>

                                <ul className="mt-2 space-y-1">
                                    {emptyAnnouncements.map((result) => (
                                        <li
                                            key={result.announcement.id}
                                            className="text-sm text-[var(--muted)]"
                                        >
                                            {result.announcement.title} —{" "}
                                            {result.announcement.course}
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
