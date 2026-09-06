"use client";

import {TaskPriority} from "@/types/taskPlanning";
import {parseLocalDate} from "@/lib/utils";

// Deterministic per-course color, so any course name (synced or
// custom-added) gets a stable, theme-consistent badge color instead of a
// flat gray fallback for anything outside a hardcoded name list.
// Deliberately avoids blue/indigo (the app's accent color), green (done),
// rose/red (overdue), and amber/yellow (urgent/frog) — those hues already
// carry a status meaning elsewhere in the planner.
const COURSE_COLORS = [
    "bg-teal-700",
    "bg-purple-700",
    "bg-fuchsia-700",
    "bg-lime-700",
    "bg-cyan-700",
    "bg-pink-700",
    "bg-violet-700",
    "bg-orange-700",
];

function courseColorFor(course: string): string {
    let hash = 0;

    for (let i = 0; i < course.length; i++) {
        hash = (hash * 31 + course.charCodeAt(i)) | 0;
    }

    return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

type AssignmentCardProps = {
    id: string;
    name: string;
    due: string;
    // Raw UTC instant, if known (Canvas-synced tasks only) — formatted
    // below in the viewer's own local timezone.
    dueAt?: string | null;
    course: string;
    gridSpan?: string;
    // Percentage of the bar's total rendered width to leave uncovered on
    // its right edge, so the bar's end lands proportionally within its
    // final day's column based on the actual due time.
    dueEndInsetPercent?: number;
    completed: boolean;
    completedAt: string | null;
    estimatedMinutes?: number;
    priority: TaskPriority;
    isFocused?: boolean;
    onToggleComplete: (id: string) => void;
    onDelete?: (id: string) => void;
    onFocus?: (id: string) => void;
    onOpen: () => void;
};

export default function AssignmentCard({
    id,
    name,
    due,
    dueAt,
    course,
    gridSpan,
    dueEndInsetPercent,
    completed,
    completedAt,
    estimatedMinutes,
    priority,
    isFocused,
    onToggleComplete,
    onDelete,
    onFocus,
    onOpen,
}: AssignmentCardProps) {

    const courseColor = courseColorFor(course);

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
        ? estimatedMinutes >= 60
            ? `${Math.floor(estimatedMinutes / 60)}h${estimatedMinutes % 60 ? ` ${estimatedMinutes % 60}m` : ""}`
            : `${estimatedMinutes}m`
        : null;

    const priorityClass = priority.level === "high"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : priority.level === "medium"
            ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
            : "border-slate-600 bg-slate-800 text-slate-300";
    return (
        <div
            style = {{
                gridColumn: gridSpan,
                marginRight: dueEndInsetPercent ? `${dueEndInsetPercent}%` : undefined,
            }}
            className = {`group rounded-lg border p-2 shadow-sm flex flex-col justify-between transition-all duration-200 overflow-hidden ${isFocused ? "ring-2 ring-indigo-400" : ""} ${wasCompletedLate
                ? "bg-slate-900 border-rose-900/80 text-rose-100 hover:border-rose-800"
                : completed
                    ? "bg-green-900/40 border-slate-800 text-slate-500"
                : isLate
                    ? "bg-rose-950/80 border-rose-500/70 text-rose-50 hover:border-rose-400"
                : "bg-slate-900 border-slate-700/80 hover:border-slate-600 text-white"}`}
            onClick = {onOpen}
        >
            <div className="flex items-start justify-between">

                <div className="flex items-start gap-2 min-w-0">

                    <input
                        type="checkbox"
                        checked={completed}
                        onClick = {(e) => e.stopPropagation()}
                        onChange={() => onToggleComplete(id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0 cursor-pointer"
                    />

                    <div className="min-w-0">

                        <div className="flex gap-1.5 items-center flex-wrap">
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border text-[#fff] ${courseColor}`}>
                                {course}
                            </span>

                            {wasCompletedLate && (
                                <span className="no-underline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-800 bg-rose-950/40 text-rose-200">
                                    ✓ Completed late
                                </span>
                            )}

                            {priority.level !== "critical" && (
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${priorityClass}`}>
                                    {priority.label}
                                </span>
                            )}

                        </div>


                        <h3 className={`text-sm font-semibold leading-snug truncate ${completed ? "line-through" : ""}`}>
                            {name}
                        </h3>


                        <p className={`text-xs ${isLate || wasCompletedLate ? "text-rose-200" : "text-slate-400"}`}>
                            Due: {due}{dueTime ? ` at ${dueTime}` : ""}{estimatedTime ? ` · Est. ${estimatedTime}` : ""}
                        </p>

                    </div>

                </div>


                <div className="flex shrink-0 items-center gap-1">
                    {onFocus && !completed && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onFocus(id);
                            }}
                            className={`text-xs px-1.5 py-0.5 rounded transition-opacity ${isFocused ? "text-indigo-300 opacity-100" : "opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-300"}`}
                            title={isFocused ? "Stop focusing on this task" : "Focus on this task in the Pomodoro timer"}
                        >
                            🎯
                        </button>
                    )}

                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-400 text-xs px-1.5 py-0.5 rounded"
                            title="Delete Task"
                        >
                            ✕
                        </button>
                    )}
                </div>

            </div>
    </div>
            
    );
}
