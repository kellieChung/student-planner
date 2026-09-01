"use client";

import { useState } from "react";
import { ProposedTask } from "@/types/proposedTask";

type AIReviewCardProps = {
    task: ProposedTask;
    onAccept: (updatedTask?: ProposedTask) => void;
    onReject: () => void;
    onEdit: () => void;
};

export default function AIReviewCard({
    task,
    onAccept,
    onReject,
    onEdit,
}: AIReviewCardProps) {
    const [dueDate, setDueDate] = useState(
        task.due ?? ""
    );

    const hasMatch =
        task.canvasMatch.status !== "none" &&
        task.canvasMatch.assignment !== null;

    const matchIsDefinite =
        task.canvasMatch.status === "definite";

    const matchIsPossible =
        task.canvasMatch.status === "possible";

    function handleAccept() {
        onAccept({
            ...task,
            due: dueDate || null,
        });
    }

    return (
        <div className="w-full max-w-6xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-xl">

            {/* ================================================== */}
            {/* HEADER */}
            {/* ================================================== */}

            <div className="border-b border-[var(--border)] px-7 py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                            AI Suggestion
                        </p>

                        <h2 className="mt-2 text-3xl font-bold tracking-tight">
                            {task.name}
                        </h2>

                        <p className="mt-1 text-sm text-[var(--muted)]">
                            {task.course}
                        </p>
                    </div>

                    <div className="w-fit rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold capitalize">
                        {task.confidence} confidence
                    </div>
                </div>
            </div>

            {/* ================================================== */}
            {/* AI TASK + ORIGINAL ANNOUNCEMENT */}
            {/* ================================================== */}

            <div className="grid gap-6 border-b border-[var(--border)] p-7 lg:grid-cols-2">

                {/* AI SUGGESTION */}

                <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        AI Interpretation
                    </p>

                    <div className="rounded-2xl border border-[var(--border)] p-5">
                        <p className="text-xl font-bold">
                            {task.name}
                        </p>

                        {task.description && (
                            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                                {task.description}
                            </p>
                        )}

                        {/* Due date */}

                        <div className="mt-6">
                            <label
                                htmlFor="ai-due-date"
                                className="mb-2 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]"
                            >
                                Due Date
                            </label>

                            <input
                                id="ai-due-date"
                                type="date"
                                value={dueDate}
                                onChange={(event) =>
                                    setDueDate(
                                        event.target.value
                                    )
                                }
                                className="w-full rounded-xl border border-[var(--border)] bg-transparent px-4 py-3 text-base font-semibold outline-none transition focus:ring-2 focus:ring-current/20"
                            />

                            {task.dueText && (
                                <p className="mt-2 text-xs text-[var(--muted)]">
                                    AI detected:{" "}
                                    {task.dueText}
                                </p>
                            )}
                        </div>

                        {/* Evidence */}

                        {task.evidence && (
                            <div className="mt-6">
                                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                                    Evidence
                                </p>

                                <p className="text-sm leading-6 text-[var(--muted)]">
                                    {task.evidence}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ORIGINAL ANNOUNCEMENT */}

                <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        Original Announcement
                    </p>

                    <div className="rounded-2xl border border-[var(--border)] p-5">

                        {task.sourceAnnouncement ? (
                            <>
                                <p className="text-xl font-bold">
                                    {
                                        task
                                            .sourceAnnouncement
                                            .title
                                    }
                                </p>

                                <div className="mt-4 max-h-80 overflow-y-auto pr-2">
                                    <p className="whitespace-pre-wrap text-sm leading-7">
                                        {
                                            task
                                                .sourceAnnouncement
                                                .message
                                        }
                                    </p>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-[var(--muted)]">
                                Original announcement unavailable.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ================================================== */}
            {/* CANVAS DUPLICATE COMPARISON */}
            {/* ================================================== */}

            <div className="border-b border-[var(--border)] p-7">

                <div className="mb-4 flex items-center gap-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                        Canvas Comparison
                    </p>

                    {matchIsDefinite && (
                        <span className="rounded-full border border-amber-500/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            Likely Duplicate
                        </span>
                    )}

                    {matchIsPossible && (
                        <span className="rounded-full border border-yellow-500/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                            Possible Duplicate
                        </span>
                    )}
                </div>

                {hasMatch ? (
                    <div className="grid gap-5 lg:grid-cols-2">

                        {/* Proposed task */}

                        <div className="rounded-2xl border border-amber-500/40 p-5">
                            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                                AI Proposed
                            </p>

                            <h3 className="mt-3 text-lg font-bold">
                                {task.name}
                            </h3>

                            {task.description && (
                                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                                    {task.description}
                                </p>
                            )}
                        </div>

                        {/* Existing Canvas assignment */}

                        <div className="rounded-2xl border border-amber-500/40 p-5">
                            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                                Existing Canvas Assignment
                            </p>

                            <h3 className="mt-3 text-lg font-bold">
                                {
                                    task.canvasMatch
                                        .assignment
                                        ?.name
                                }
                            </h3>

                            {task.canvasMatch
                                .assignment
                                ?.description && (
                                <p className="mt-2 max-h-40 overflow-y-auto text-sm leading-6 text-[var(--muted)]">
                                    {
                                        task.canvasMatch
                                            .assignment
                                            .description
                                    }
                                </p>
                            )}

                            {task.canvasMatch
                                .assignment
                                ?.dueDate && (
                                <p className="mt-4 text-xs text-[var(--muted)]">
                                    Due:{" "}
                                    {
                                        task.canvasMatch
                                            .assignment
                                            .dueDate
                                    }
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-[var(--border)] p-6">
                        <div className="flex items-start gap-4">
                            <span className="text-2xl">
                                ✅
                            </span>

                            <div>
                                <p className="font-semibold">
                                    No Canvas duplicate detected
                                </p>

                                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                                    The AI did not find an
                                    existing assignment that
                                    appears to represent this
                                    task.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI duplicate reasoning */}

                {hasMatch &&
                    task.canvasMatch.reason && (
                        <div className="mt-5 rounded-2xl border border-[var(--border)] p-5">
                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                                Why AI Flagged This
                            </p>

                            <p className="mt-2 text-sm leading-6">
                                {task.canvasMatch.reason}
                            </p>
                        </div>
                    )}
            </div>

            {/* ================================================== */}
            {/* ACTIONS */}
            {/* ================================================== */}

            <div className="grid grid-cols-3 gap-3 p-7">
                <button
                    onClick={onReject}
                    className="rounded-2xl border border-[var(--border)] px-4 py-4 font-semibold transition hover:bg-red-500/10"
                >
                    ❌
                    <span className="ml-2">
                        Reject
                    </span>
                </button>

                <button
                    onClick={onEdit}
                    className="rounded-2xl border border-[var(--border)] px-4 py-4 font-semibold transition hover:bg-yellow-500/10"
                >
                    ✏️
                    <span className="ml-2">
                        Edit
                    </span>
                </button>

                <button
                    onClick={handleAccept}
                    className="rounded-2xl bg-black px-4 py-4 font-semibold text-white transition hover:opacity-80 dark:bg-white dark:text-black"
                >
                    ✅
                    <span className="ml-2">
                        Accept
                    </span>
                </button>
            </div>
        </div>
    );
}