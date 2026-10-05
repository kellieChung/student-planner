"use client";

import { useState } from "react";
import {
    chartedIndexes,
    cheapestStarPrice,
    CONSTELLATIONS,
    Constellation,
    isVisible,
    nextUnlock,
    ownsRegion,
    SKY_REGIONS,
    SkyRegion,
} from "@/lib/constellations";
import { useStarChart } from "@/components/starchart/StarChartContext";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import ConstellationDetail from "@/components/starchart/ConstellationDetail";
import StarField from "@/components/brand/StarField";
import { StarIcon } from "@/components/brand/Icons";
import Switch from "@/components/ui/Switch";

const STAR_CHART_THEME_KEY = "planner_star_chart_theme";

type Props = {
    onBack: () => void;
};

export default function StarChartView({ onBack }: Props) {
    const { state } = useStarChart();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // The planner (and its theme switch) is covered while the chart is open,
    // so the app theme read at mount stays current.
    const [isDayTheme] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "light");
    const [lightChart, setLightChart] = useState(
        () => typeof document !== "undefined" && document.documentElement.dataset.starChart === "day"
    );

    const updateLightChart = (next: boolean) => {
        setLightChart(next);
        if (next) document.documentElement.dataset.starChart = "day";
        else delete document.documentElement.dataset.starChart;
        try {
            localStorage.setItem(STAR_CHART_THEME_KEY, next ? "day" : "night");
        } catch {
            // Storage unavailable: the choice just lasts for this page load.
        }
    };

    const visible = CONSTELLATIONS.filter((constellation) =>
        isVisible(constellation, state.lifetimeStarlight, state.charted, state.unlockedRegions)
    );
    const ownedRegions = SKY_REGIONS.filter((region) => ownsRegion(region.id, state.unlockedRegions));
    const lockedRegions = SKY_REGIONS.filter((region) => !ownsRegion(region.id, state.unlockedRegions));
    const upcoming = ownedRegions
        .map((region) => nextUnlock(region.id, state.lifetimeStarlight))
        .filter((constellation): constellation is Constellation => constellation !== null)
        .sort((a, b) => a.unlockAt - b.unlockAt)[0] ?? null;
    const selected = selectedId ? CONSTELLATIONS.find((constellation) => constellation.id === selectedId) ?? null : null;
    const fullyCharted = visible.filter(
        (constellation) => chartedIndexes(constellation.id, state.charted).size >= constellation.stars.length
    ).length;

    return (
        <div className="sky star-chart relative min-h-full overflow-hidden bg-[var(--ls-night)] text-[var(--ls-ivory)]">
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
                    <div className="flex flex-wrap items-center gap-3">
                        {isDayTheme && (
                            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ls-muted)]">
                                Light chart
                                <Switch checked={lightChart} onChange={updateLightChart} ariaLabel="Light chart" />
                            </label>
                        )}
                        <button
                            type="button"
                            onClick={onBack}
                            className="rounded-full border border-[var(--ls-line)] px-4 py-2 text-sm font-semibold text-[var(--ls-ivory)] transition-colors hover:border-[var(--ls-gold)]"
                        >
                            Back to Ship&apos;s Log
                        </button>
                    </div>
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
                        {fullyCharted} of {visible.length}
                    </Stat>
                    <Stat label="Next to appear">
                        {upcoming ? (
                            <span className="text-base">at {upcoming.unlockAt} lifetime</span>
                        ) : lockedRegions.length > 0 ? (
                            <span className="text-base">{lockedRegions[0].name}, below</span>
                        ) : (
                            <span className="text-base">All discovered</span>
                        )}
                    </Stat>
                </dl>

                {ownedRegions.map((region, index) => {
                    const regionVisible = visible.filter((constellation) => constellation.region === region.id);
                    const regionNext = nextUnlock(region.id, state.lifetimeStarlight);
                    const regionRemaining = CONSTELLATIONS.filter(
                        (constellation) => constellation.region === region.id && !regionVisible.includes(constellation)
                    ).length;

                    return (
                        <section key={region.id} className="mt-8">
                            {ownedRegions.length > 1 && (
                                <h2 className="mb-3 font-[family-name:var(--font-spectral)] text-2xl">{region.name}</h2>
                            )}
                            <ul
                                data-tour={index === 0 ? "chart-grid" : undefined}
                                className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
                            >
                                {regionVisible.map((constellation) => (
                                    <li key={constellation.id}>
                                        <ConstellationTile constellation={constellation} onOpen={() => setSelectedId(constellation.id)} />
                                    </li>
                                ))}
                                {regionNext && (
                                    <li>
                                        <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ls-line)] p-4 text-center">
                                            <p className="font-[family-name:var(--font-spectral)] text-lg text-[var(--ls-muted)]">Uncharted sky</p>
                                            <p className="mt-1 text-xs text-[var(--ls-muted)]">
                                                Something appears at {regionNext.unlockAt} lifetime Starlight
                                                {` (${Math.max(0, regionNext.unlockAt - state.lifetimeStarlight)} to go)`}.
                                            </p>
                                            {regionRemaining > 1 && (
                                                <p className="mt-2 text-xs text-[var(--ls-muted)]">
                                                    {regionRemaining - 1} more after that.
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                )}
                            </ul>
                        </section>
                    );
                })}

                {lockedRegions.map((region) => (
                    <ExpansionCard key={region.id} region={region} />
                ))}
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
    const fromPrice = cheapestStarPrice(constellation, state.charted);

    return (
        <button
            type="button"
            onClick={onOpen}
            className="ls-constellation group flex h-full w-full flex-col items-center rounded-2xl border border-[var(--ls-line)] bg-[var(--ls-tile)] p-4 text-center transition-colors hover:border-[var(--ls-gold)]"
        >
            <ConstellationFigure constellation={constellation} charted={charted} className="w-full max-w-[170px]" />
            <span className="mt-2 font-[family-name:var(--font-spectral)] text-lg">{constellation.name}</span>
            <span className="text-xs text-[var(--ls-muted)]">
                {complete ? "Fully charted" : `${charted.size} of ${total} charted · from ${fromPrice}`}
            </span>
        </button>
    );
}

// An expansion region not yet bought: locked until lifetime Starlight reaches
// it, then a two-step buy (the shared ConfirmDialog is styled for deletes).
function ExpansionCard({ region }: { region: SkyRegion }) {
    const { state, unlockRegion } = useStarChart();
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const count = CONSTELLATIONS.filter((constellation) => constellation.region === region.id).length;
    const inReach = state.lifetimeStarlight >= region.requiresLifetime;
    const shortfall = region.price - state.starlight;

    async function handleUnlock() {
        setPending(true);
        setError(null);

        const result = await unlockRegion(region.id);

        setPending(false);
        setConfirming(false);

        if (!result.ok) setError(result.error);
    }

    return (
        <section className="mt-10 rounded-3xl border border-dashed border-[var(--ls-gold)]/50 bg-[var(--ls-tile)] p-5 sm:p-7">
            <p className="ls-eyebrow text-[var(--ls-gold)]">Expansion · {count} constellations</p>
            <h2 className="mt-1 font-[family-name:var(--font-spectral)] text-2xl">{region.name}</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--ls-muted)]">{region.description}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                {!inReach ? (
                    <p className="text-sm text-[var(--ls-muted)]">
                        Discover every constellation in your sky first: {state.lifetimeStarlight} of{" "}
                        {region.requiresLifetime} lifetime Starlight.
                    </p>
                ) : confirming ? (
                    <>
                        <p className="text-sm text-[var(--ls-ivory)]">
                            Spend {region.price} of your {state.starlight} Starlight?
                        </p>
                        <button
                            type="button"
                            onClick={handleUnlock}
                            disabled={pending}
                            className="inline-flex items-center gap-2 rounded-full bg-[var(--ls-gold)] px-5 py-2 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <StarIcon size={14} />
                            {pending ? "Charting a course…" : "Yes, open it"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            disabled={pending}
                            className="rounded-full border border-[var(--ls-line)] px-4 py-2 text-sm font-semibold text-[var(--ls-muted)] transition-colors hover:text-[var(--ls-ivory)]"
                        >
                            Not yet
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setConfirming(true);
                                setError(null);
                            }}
                            disabled={shortfall > 0}
                            className="inline-flex items-center gap-2 rounded-full bg-[var(--ls-gold)] px-5 py-2 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <StarIcon size={14} />
                            Chart {region.name} · {region.price}
                        </button>
                        {shortfall > 0 && (
                            <p className="text-xs text-[var(--ls-muted)]">You need {shortfall} more Starlight.</p>
                        )}
                    </>
                )}
            </div>

            {error && <p className="mt-2 text-xs text-[var(--ls-error)]">{error}</p>}
        </section>
    );
}
