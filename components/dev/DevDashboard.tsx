"use client";

import { useState } from "react";
import Link from "next/link";
import { GamificationState } from "@/types/gamification";
import { TownState } from "@/types/townState";
import DevCreditsPanel from "@/components/dev/DevCreditsPanel";
import DevAnalyzerTools from "@/components/dev/DevAnalyzerTools";
import GamificationDevPanel from "@/components/dev/GamificationDevPanel";

export type DevTabId = "credits" | "analyzer" | "onboarding" | "gamification" | "map";

type Props = {
    initialTab: DevTabId;
    currentEmail: string;
    initialGamification: GamificationState;
    initialTownState: TownState;
};

const TABS: { id: DevTabId; label: string }[] = [
    { id: "credits", label: "Accounts & credits" },
    { id: "analyzer", label: "Analyzer tools" },
    { id: "onboarding", label: "Onboarding tour" },
    { id: "gamification", label: "Gamification (retired town)" },
    { id: "map", label: "Map editor (retired)" },
];

export default function DevDashboard({
    initialTab,
    currentEmail,
    initialGamification,
    initialTownState,
}: Props) {
    const [tab, setTab] = useState<DevTabId>(initialTab);

    function selectTab(next: DevTabId) {
        setTab(next);
        window.history.replaceState(null, "", `/dev?tab=${next}`);
    }

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
                <h1 className="text-2xl font-bold">Dev dashboard</h1>

                <Link href="/" className="text-sm font-semibold underline text-[var(--muted)]">
                    Back to the planner
                </Link>
            </div>

            <p className="mb-4 text-xs text-[var(--muted)]">
                Signed in as {currentEmail}. Production and local dev share one database — changes here hit real rows.
            </p>

            <div className="mb-6 flex flex-wrap gap-1 rounded-xl bg-[var(--border)]/30 p-1">
                {TABS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => selectTab(option.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            tab === option.id
                                ? "bg-[var(--accent)] text-white"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {tab === "credits" && <DevCreditsPanel currentEmail={currentEmail} />}

            {tab === "analyzer" && <DevAnalyzerTools />}

            {tab === "onboarding" && (
                <LaunchCard
                    title="Onboarding tour"
                    body="Opens the real planner with the tour running. Finishing never writes the first-run flag; the pill in the corner can restart the tour or reset the flag."
                    href="/dev/onboarding"
                    label="Open tour preview"
                />
            )}

            {tab === "gamification" && (
                <GamificationDevPanel
                    initialGamification={initialGamification}
                    initialTownState={initialTownState}
                />
            )}

            {tab === "map" && (
                <LaunchCard
                    title="Map editor"
                    body="The World map editor for the retired town. It needs the full viewport, so it opens on its own page."
                    href="/dev/map-editor"
                    label="Open map editor"
                />
            )}
        </div>
    );
}

function LaunchCard({
    title,
    body,
    href,
    label,
}: {
    title: string;
    body: string;
    href: string;
    label: string;
}) {
    return (
        <div className="theme-surface rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <p className="text-lg font-bold">{title}</p>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">{body}</p>

            <Link
                href={href}
                className="mt-4 inline-block rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
            >
                {label}
            </Link>
        </div>
    );
}
