"use client";

import { ProposedTask } from "@/types/proposedTask";

type AIReviewCardProps = {
    task: ProposedTask;
    onAccept: () => void;
    onReject: () => void;
    onEdit: () => void;
};

export default function AIReviewCard({
    task,
    onAccept,
    onReject,
    onEdit,
}: AIReviewCardProps) {
    return (
        <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg">
            <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                    AI Suggestion
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                    {task.name}
                </h2>
            </div>

            <div className="mb-6 space-y-2 text-sm">
                <p>
                    <span className="font-semibold">
                        Course:
                    </span>{" "}
                    {task.course}
                </p>

                <p>
                    <span className="font-semibold">
                        Due:
                    </span>{" "}
                    {task.due ?? "No due date detected"}
                </p>

                <p>
                    <span className="font-semibold">
                        Confidence:
                    </span>{" "}
                    {task.confidence}
                </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={onReject}
                    className="rounded-xl border px-4 py-3 font-semibold transition hover:bg-red-50"
                >
                    ❌
                    <span className="ml-2 hidden sm:inline">
                        Reject
                    </span>
                </button>

                <button
                    onClick={onEdit}
                    className="rounded-xl border px-4 py-3 font-semibold transition hover:bg-yellow-50"
                >
                    ✏️
                    <span className="ml-2 hidden sm:inline">
                        Edit
                    </span>
                </button>

                <button
                    onClick={onAccept}
                    className="rounded-xl border px-4 py-3 font-semibold transition hover:bg-green-50"
                >
                    ✅
                    <span className="ml-2 hidden sm:inline">
                        Accept
                    </span>
                </button>
            </div>
        </div>
    );
}