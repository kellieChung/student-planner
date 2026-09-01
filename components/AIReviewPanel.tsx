"use client";

import { useState } from "react";
import { ProposedTask } from "@/types/proposedTask";
import AIReviewCard from "@/components/AIReviewCard";

export default function AIReviewPanel() {
    const [tasks, setTasks] = useState<ProposedTask[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [started, setStarted] = useState(false);

    async function analyzeAnnouncements() {
        setLoading(true);
        setStarted(true);

        try {
            const response = await fetch(
                "/api/ai/analyze-announcements",
                {
                    method: "POST",
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.error ||
                        "Failed to analyze announcements."
                );
            }

            const extractedTasks: ProposedTask[] =
                data.results.flatMap(
                    (result: {
                        tasks: ProposedTask[];
                    }) => result.tasks
                );

            setTasks(extractedTasks);
            setCurrentIndex(0);
        } catch (error) {
            console.error(
                "❌ Failed to analyze announcements:",
                error
            );
        } finally {
            setLoading(false);
        }
    }

    function nextTask() {
        setCurrentIndex((index) => index + 1);
    }

    function handleAccept(updatedTask?: ProposedTask) {
        const acceptedTask = updatedTask ?? tasks[currentIndex];

        console.log("✅ Accepted:", acceptedTask);

        nextTask();
    }

    function handleReject() {
        console.log(
            "❌ Rejected:",
            tasks[currentIndex]
        );

        nextTask();
    }

    function handleEdit() {
        console.log(
            "✏️ Edit:",
            tasks[currentIndex]
        );

        // We'll build the editor next.
    }

    const currentTask = tasks[currentIndex];

    const finished =
        started &&
        !loading &&
        tasks.length > 0 &&
        currentIndex >= tasks.length;

    return (
        <div className="mt-8">
            {!started && (
                <button
                    onClick={analyzeAnnouncements}
                    className="rounded-xl bg-black px-5 py-3 font-semibold text-white transition hover:opacity-80"
                >
                    🤖 Review AI Suggestions
                </button>
            )}

            {loading && (
                <div className="rounded-xl border p-6">
                    <p className="font-semibold">
                        🤖 Analyzing announcements...
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                        Your local AI is reading through your
                        Canvas announcements.
                    </p>
                </div>
            )}

            {currentTask && !loading && (
                <div>
                    <p className="mb-3 text-sm text-[var(--muted)]">
                        Suggestion{" "}
                        {currentIndex + 1} of{" "}
                        {tasks.length}
                    </p>

                    <AIReviewCard
                        task={currentTask}
                        onAccept={handleAccept}
                        onReject={handleReject}
                        onEdit={handleEdit}
                    />
                </div>
            )}

            {finished && (
                <div className="rounded-2xl border p-6">
                    <p className="text-xl font-bold">
                        🎉 You're all caught up!
                    </p>

                    <p className="mt-2 text-sm text-[var(--muted)]">
                        You've reviewed all of the AI
                        suggestions.
                    </p>
                </div>
            )}

            {started &&
                !loading &&
                tasks.length === 0 && (
                    <div className="rounded-2xl border p-6">
                        <p className="font-semibold">
                            No tasks found!
                        </p>

                        <p className="mt-1 text-sm text-[var(--muted)]">
                            The AI didn't find any work in
                            your announcements.
                        </p>
                    </div>
                )}
        </div>
    );
}