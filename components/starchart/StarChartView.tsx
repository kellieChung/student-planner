"use client";

import { useState } from "react";
import { chartedIndexes, CONSTELLATIONS, Constellation, isUnlocked, nextUnlock, starPrice } from "@/lib/constellations";
import { useStarChart } from "@/components/starchart/StarChartContext";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import ConstellationDetail from "@/components/starchart/ConstellationDetail";
import StarField from "@/components/brand/StarField";
import { StarIcon } from "@/components/brand/Icons";

type Props = {
    onBack: () => void;
};

export default function StarChartView({ onBack }: Props) {
    const { state } = useStarChart();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const unlocked = CONSTELLATIONS.filter((constellation) => isUnlocked(constellation, state.lifetimeStarlight));
    const upcoming = nextUnlock(state.lifetimeStarlight);
    const remainingCount = CONSTELLATIONS.length - unlocked.length;
    const selected = selectedId ? CONSTELLATIONS.find((constellation) => constellation.id === selectedId) ?? null : null;
    const fullyCharted = unlocked.filter(
        (constellation) => chartedIndexes(constellation.id, state.charted).size >= constellation.stars.length
    ).length;

    return (
        <div className="sky relative min-h-full overflow-hidden bg-[var(--ls-night)] text-[var(--ls-ivory)]">
            <StarField count={160} seed={11} />

            <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="ls-eyebrow text-[var(--ls-gold)]">Star Chart</p>
                        <h1 className="mt-1 font-[family-name:var(--font-spectral)] text-3xl sm:text-4xl">Your sky so far</h1>
                        <p className="mt-2 max-w-md text-sm text-[var(--ls-muted)]">
                            Finish tasks to earn Starlight, then spend it to chart stars. New constellations appear as
                            your lifetime Starlight grows.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onBack}
                        className="rounded-full border border-[var(--ls-line)] px-4 py-2 text-sm font-semibold text-[var(--ls-ivory)] transition-colors hover:border-[var(--ls-gold)]"
                    >
                        Back to Ship&apos;s Log
                    </button>
                </div>

                <dl data-tour="chart-balance" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Starlight to spend">
                        <span className="inline-flex items-center gap-1.5 text-[var(--ls-gold)]">
                            <StarIcon size={16} />
                            {state.starlight}
                        </span>
                    </Stat>
                    <Stat label="Lifetime Starlight">{state.lifetimeStarlight}</Stat>
                    <Stat label="Constellations charted">
                        {fullyCharted} of {unlocked.length}
                    </Stat>
                    <Stat label="Next to appear">
                        {upcoming ? (
                            <span className="text-base">at {upcoming.unlockAt} lifetime</span>
                        ) : (
                            <span className="text-base">All discovered</span>
                        )}
                    </Stat>
                </dl>

                <ul data-tour="chart-grid" className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {unlocked.map((constellation) => (
                        <li key={constellation.id}>
                            <ConstellationTile constellation={constellation} onOpen={() => setSelectedId(constellation.id)} />
                        </li>
                    ))}
                    {upcoming && (
                        <li>
                            <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ls-line)] p-4 text-center">
                                <p className="font-[family-name:var(--font-spectral)] text-lg text-[var(--ls-muted)]">Uncharted sky</p>
                                <p className="mt-1 text-xs text-[var(--ls-muted)]">
                                    Something appears at {upcoming.unlockAt} lifetime Starlight
                                    {` (${Math.max(0, upcoming.unlockAt - state.lifetimeStarlight)} to go)`}.
                                </p>
                                {remainingCount > 1 && (
                                    <p className="mt-2 text-xs text-[var(--ls-muted)]">
                                        {remainingCount - 1} more after that.
                                    </p>
                                )}
                            </div>
                        </li>
                    )}
                </ul>
            </div>

            {selected && <ConstellationDetail constellation={selected} onClose={() => setSelectedId(null)} />}
        </div>
    );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl bg-[var(--ls-navy-raised)] px-4 py-3">
            <dt className="text-xs text-[var(--ls-muted)]">{label}</dt>
            <dd className="mt-1 font-[family-name:var(--font-spectral)] text-xl">{children}</dd>
        </div>
    );
}

function ConstellationTile({ constellation, onOpen }: { constellation: Constellation; onOpen: () => void }) {
    const { state } = useStarChart();
    const charted = chartedIndexes(constellation.id, state.charted);
    const total = constellation.stars.length;
    const complete = charted.size >= total;

    return (
        <button
            type="button"
            onClick={onOpen}
            className="ls-constellation group flex h-full w-full flex-col items-center rounded-2xl border border-[var(--ls-line)] bg-[rgb(22_27_51/0.6)] p-4 text-center transition-colors hover:border-[var(--ls-gold)]"
        >
            <ConstellationFigure constellation={constellation} charted={charted} className="w-full max-w-[170px]" />
            <span className="mt-2 font-[family-name:var(--font-spectral)] text-lg">{constellation.name}</span>
            <span className="text-xs text-[var(--ls-muted)]">
                {complete ? "Fully charted" : `${charted.size} of ${total} charted · ${starPrice(constellation)} each`}
            </span>
        </button>
    );
}
