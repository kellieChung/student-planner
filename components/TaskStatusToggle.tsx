"use client";

import Tooltip from "@/components/ui/Tooltip";
import type {CSSProperties} from "react";
import {nextTaskStatus, TaskStatus} from "@/lib/taskStatus";

type Props = {
    status: TaskStatus;
    onChange: (next: TaskStatus) => void;
    size?: "sm" | "md";
};

const STATUS_LABEL: Record<TaskStatus, string> = {
    not_started: "Not started — click to start",
    in_progress: "In progress — click to mark done",
    completed: "Completed — click to reset",
};

export default function TaskStatusToggle({ status, onChange, size = "md" }: Props) {
    const dimension = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

    const style: CSSProperties =
        status === "completed"
            ? { background: "#22c55e", borderColor: "transparent" }
            : status === "in_progress"
                ? { background: "conic-gradient(var(--accent) 180deg, transparent 180deg)" }
                : { background: "transparent" };

    return (
        <Tooltip label={STATUS_LABEL[status]}>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onChange(nextTaskStatus(status));
                }}
                aria-label={STATUS_LABEL[status]}
                className={`task-status-toggle shrink-0 rounded-full border border-slate-500 transition-transform hover:scale-110 ${dimension} ${status === "completed" ? "task-status-toggle--pop" : ""}`}
                style={style}
            >
                {status === "completed" && (
                    <svg viewBox="0 0 16 16" className="h-full w-full p-0.5 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>
        </Tooltip>
    );
}
