"use client";

import { useState } from "react";

export default function AnalyzeAnnouncementsButton() {
    const [loading, setLoading] = useState(false);

    async function analyzeAnnouncements() {
        try {
            setLoading(true);

            const response = await fetch(
                "/api/ai/analyze-announcements",
                {
                    method: "POST",
                }
            );

            const data = await response.json();

            console.log(
                "🤖 Announcement analysis result:",
                data
            );

            if (!response.ok) {
                console.error(
                    "❌ Announcement analysis failed:",
                    data
                );

                return;
            }

            console.log(
                "🎉 Announcement analysis complete!"
            );
        } catch (error) {
            console.error(
                "❌ Failed to analyze announcements:",
                error
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            onClick={analyzeAnnouncements}
            disabled={loading}
            className="mb-6 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {loading
                ? "Analyzing announcements..."
                : "🤖 Analyze Announcements"}
        </button>
    );
}