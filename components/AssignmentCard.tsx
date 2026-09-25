"use client";

import Tooltip from "@/components/ui/Tooltip";
import {parseLocalDate, formatEstimatedMinutes} from "@/lib/utils";
import {TaskStatus} from "@/lib/taskStatus";
import {courseColorDefault, readableTextColor} from "@/lib/courseColor";
import TaskStatusToggle from "./TaskStatusToggle";

type AssignmentCardProps = {
    id: string;
    name: string;
    // Pieces of the normalized "COURSE - TYPE - DAY - name" card title
    // (lib/taskLabel.ts, computed by the caller).
    courseAbbreviation: string;
    typeCode: string;
    dayCode: string;
    // Marks this card's label as the onboarding tour's "task-label" stop.
    tourAnchor?: boolean;
    due: string;
    // Raw UTC instant, if known (Canvas-synced tasks only) — formatted
    // below in the viewer's own local timezone.
    dueAt?: string | null;
    course: string;
    // User-set hex color (e.g. "#3b82f6") for the course badge, from
    // CanvasCourse.color — null/undefined falls back to courseColorFor's
    // deterministic hash below.
    courseColor?: string | null;
    // 1-indexed day-column line numbers (1..8) from calculateGridSpan's
    // GridSpan — used below to derive this card's absolute left/width so
    // it stays pixel-aligned with the weekly grid's divider layer (a real
    // CSS grid with gap-2, so column edges aren't at n/7 * 100%).
    columnStart?: number;
    columnEnd?: number;
    // Pixel Y-offset within the weekly grid's task layer, computed by
    // WeeklyPlannerView.tsx's packColumnOffsets (explicit per-column
    // placement — see that function's comment in lib/utils.ts for why the
    // weekly grid doesn't use CSS Grid's row mechanic).
    topPx?: number;
    // Percentage of the bar's total rendered width to leave uncovered on
    // its right edge, so the bar's end lands proportionally within its
    // final day's column based on the actual due time.
    dueEndInsetPercent?: number;
    status: TaskStatus;
    completedAt: string | null;
    // True while the green completion pulse plays (~550ms) — see
    // WeeklyPlannerView.tsx's pulsingIds. Purely visual; the card never
    // moves on completion.
    isCompleting?: boolean;
    estimatedMinutes?: number;
    isFocused?: boolean;
    // True when this task came from an AI-detected candidate
    // (sourceAnnouncementId set) and its badge hasn't been dismissed yet
    // (aiTagDismissedAt still null) — see AutoTaskCreation.md's logging
    // section: dismissing this is an implicit "yes, this was correct,"
    // distinct from deleting the task outright.
    isAiDetected?: boolean;
    onDismissAiTag?: (id: string) => void;
    onSetStatus: (status: TaskStatus) => void;
    onDelete?: (id: string) => void;
    onFocus?: (id: string) => void;
    onOpen: () => void;
};

export default function AssignmentCard({
    id,
    name,
    courseAbbreviation,
    typeCode,
    dayCode,
    tourAnchor = false,
    due,
    dueAt,
    course,
    courseColor,
    columnStart,
    columnEnd,
    topPx,
    dueEndInsetPercent,
    status,
    completedAt,
    isCompleting,
    estimatedMinutes,
    isFocused,
    isAiDetected,
    onDismissAiTag,
    onSetStatus,
    onDelete,
    onFocus,
    onOpen,
}: AssignmentCardProps) {

    const courseColorClass = courseColor ? "" : courseColorDefault(course);
    const completed = status === "completed";

    let isLate = false;
    let wasCompletedLate = false;

    if (due) {
        const dueDate = parseLocalDate(due).setHours(0, 0, 0, 0);
        const today = new Date().setHours(0, 0, 0, 0);
        isLate = dueDate < today && !completed;

        if (completed && completedAt) {
            const completedDate = parseLocalDate(completedAt).setHours(0, 0, 0, 0);
            wasCompletedLate = completedDate > dueDate;
        }
    }

    const dueTime = dueAt
        ? new Date(dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : null;

    const estimatedTime = estimatedMinutes
        ? formatEstimatedMinutes(estimatedMinutes)
        : null;

    const detailLine = [dueTime, estimatedTime]
        .filter(Boolean)
        .join(" - ");

    // The weekly grid's divider layer is a real `grid grid-cols-7 gap-2` —
    // its column edges are NOT at `n/7 * 100%` (the 8px gaps eat fixed
    // pixels regardless of container width). left/width below reproduce
    // that grid's math exactly (48px = 6 gaps x 8px) instead of a flat
    // percentage, so cards stay aligned with the dividers across the whole
    // week instead of drifting progressively toward Fri/Sat.
    const dayIndex = (columnStart ?? 1) - 1;
    const span = (columnEnd ?? (columnStart ?? 1) + 1) - (columnStart ?? 1);
    // calc() allows multiplying a length expression by a plain <number>,
    // so the due-time inset (a fraction of this card's own width) can be
    // folded directly into the width calc rather than needing a separate
    // wrapper element for it.
    const insetFactor = 1 - (dueEndInsetPercent ?? 0) / 100;
    const left = `calc((100% - 48px) / 7 * ${dayIndex} + ${dayIndex} * 8px)`;
    const width = `calc(((100% - 48px) / 7 * ${span} + ${span - 1} * 8px) * ${insetFactor})`;

    // Completed tasks are frozen in place permanently (see
    // WeeklyPlannerView.tsx's sortedTasks), so they need to stay out of the
    // way rather than keep a full card's worth of space forever — much
    // shorter, tighter, dimmer, badge/detail-line dropped entirely, just
    // enough left to show it exists. Active cards get a lighter background
    // than the default Tailwind bg-slate-900 so they read clearly against
    // the grid's own bg-slate-900/30 divider layer instead of blending in.
    // Heights are fixed (not min-h): each card's vertical offset is
    // computed by packColumnOffsets from these exact constants (see
    // lib/utils.ts's CARD_HEIGHT_PX), so a content-driven height here
    // would silently desync from that math and cause visual overlap.
    return (
        <div
            style = {{
                position: "absolute",
                left,
                width,
                top: `${topPx ?? 0}px`,
            }}
            className = {`group rounded-lg border shadow-sm overflow-hidden transition-all duration-200 ${completed ? "h-[28px] px-1.5 py-0.5 opacity-55 hover:opacity-90" : "h-[72px] p-1.5"} ${isFocused ? "ring-2 ring-indigo-400" : ""} ${isCompleting ? "task-card--completing" : ""} ${wasCompletedLate
                ? "bg-slate-900 border-rose-900/80 text-rose-100 hover:border-rose-800"
                : completed
                    ? "bg-green-900/40 border-slate-800 text-slate-500"
                : isLate
                    ? "bg-rose-950/80 border-rose-500/70 text-rose-50 hover:border-rose-400"
                : status === "in_progress"
                    ? "bg-indigo-950/30 border-indigo-500/60 text-white hover:border-indigo-400"
                : "bg-slate-800 border-slate-600 hover:border-slate-500 text-white"}`}
            onClick = {onOpen}
        >
            <div className={`flex min-w-0 ${completed ? "items-center gap-1.5" : "items-start gap-1"}`}>

                <TaskStatusToggle status={status} onChange={onSetStatus} size="sm" />

                {completed ? (
                    <Tooltip label={name}>
                        <h3 data-tour={tourAnchor ? "task-label" : undefined} className="min-w-0 truncate text-xs leading-none line-through">
                            {`${courseAbbreviation} - ${typeCode} - ${dayCode} - ${name}`}
                        </h3>
                    </Tooltip>
                ) : (
                    <div className="min-w-0">

                        {/* Fixed size so every badge looks the same regardless
                            of card width; max-w-full only lets it truncate on
                            cards too narrow to fit the label at all. */}
                        <span
                            style={courseColor ? { backgroundColor: courseColor, color: readableTextColor(courseColor) } : undefined}
                            className={`inline-block max-w-full truncate align-bottom leading-none text-[10px] font-bold uppercase tracking-wider px-1.5 py-1 rounded border text-[#fff] ${courseColorClass}`}
                        >
                            {course}
                        </span>

                        <Tooltip label={name}>
                            <h3
                                data-tour={tourAnchor ? "task-label" : undefined}
                                className="text-sm font-semibold leading-tight truncate"
                            >
                                {`${courseAbbreviation} - ${typeCode} - ${dayCode} - ${name}`}
                            </h3>
                        </Tooltip>

                        {detailLine && (
                            <p className={`truncate text-xs ${isLate || wasCompletedLate ? "text-rose-200" : "text-slate-400"}`}>
                                {detailLine}
                            </p>
                        )}

                    </div>
                )}

            </div>

            <div className="absolute top-1 right-1 flex items-center gap-1">
                {isAiDetected && !completed && onDismissAiTag && (
                    <Tooltip label="AI-detected — click to dismiss this tag">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismissAiTag(id);
                            }}
                            className="text-xs px-1.5 py-0.5 rounded text-indigo-300 opacity-80 hover:opacity-100" aria-label="AI-detected — click to dismiss this tag"
                        >
                            🤖
                        </button>
                    </Tooltip>
                )}

                {onFocus && !completed && (
                    <Tooltip label={isFocused ? "Stop focusing on this task" : "Focus on this task on the Watch"}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onFocus(id);
                            }}
                            className={`text-xs px-1.5 py-0.5 rounded transition-opacity ${isFocused ? "text-indigo-300 opacity-100" : "opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-300"}`} aria-label={isFocused ? "Stop focusing on this task" : "Focus on this task on the Watch"}
                        >
                            🎯
                        </button>
                    </Tooltip>
                )}

                {onDelete && (
                    <Tooltip label="Delete Task">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-400 text-xs px-1.5 py-0.5 rounded" aria-label="Delete Task"
                        >
                            ✕
                        </button>
                    </Tooltip>
                )}
            </div>
        </div>
    );
}
