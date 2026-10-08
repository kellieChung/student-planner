"use client";

import { useEffect, useRef, useState } from "react";
import {
    chartedIndexes,
    cheapestStarPrice,
    CONSTELLATIONS,
    Constellation,
    isRegionComplete,
    isVisible,
    meetsRegionPrerequisites,
    nextUnlock,
    ownsRegion,
    regionConstellations,
    SKY_REGIONS,
    SkyRegion,
} from "@/lib/constellations";
import { claimableRewards, LEGENDS, legendParts, legendProgress, legendRewardId, type Reward } from "@/lib/legends";
import { useStarChart } from "@/components/starchart/StarChartContext";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import ConstellationDetail from "@/components/starchart/ConstellationDetail";
import StarField from "@/components/brand/StarField";
import { StarIcon } from "@/components/brand/Icons";
import Switch from "@/components/ui/Switch";
import GalaxyView from "@/components/starchart/GalaxyView";
import NebulaPanel from "@/components/starchart/NebulaPanel";
import { useCosmetics } from "@/components/starchart/CosmeticsContext";
import { COSMETIC_CATALOG, cosmeticVariant, skyHasOwnPalette } from "@/lib/cosmetics";

const STAR_CHART_THEME_KEY = "planner_star_chart_theme";

type Props = {
    onBack: () => void;
    // Star Chart beta: Galaxy and Nebula tabs, cosmetics.
    beta?: boolean;
};

type Tab = "chart" | "galaxy" | "nebula";

const TABS: { id: Tab; label: string }[] = [
    { id: "chart", label: "Chart" },
    { id: "galaxy", label: "Galaxy" },
    { id: "nebula", label: "Nebula" },
];

export default function StarChartView({ onBack, beta = false }: Props) {
    const { state, claimRewards } = useStarChart();
    const { appearance, ensureLoaded, setPreview } = useCosmetics();
    const [tab, setTabState] = useState<Tab>("chart");

    // Previews are only for browsing the Nebula; leaving it drops them.
    const setTab = (next: Tab) => {
        if (next !== "nebula") setPreview({});
        setTabState(next);
    };

    // The cosmetics provider outlives the chart, so closing it drops them too.
    useEffect(() => () => setPreview({}), [setPreview]);

    useEffect(() => {
        if (beta) ensureLoaded();
    }, [beta, ensureLoaded]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [collected, setCollected] = useState<Reward[]>([]);
    const claimAttempted = useRef(false);

    // Bounties finished without a fresh chart (e.g. before Legends shipped)
    // are collected once on opening; nothing is sent when none are due.
    useEffect(() => {
        if (claimAttempted.current) return;
        if (claimableRewards(state.charted, state.claimedRewards).length === 0) return;

        claimAttempted.current = true;
        claimRewards().then((result) => {
            if (result.ok && result.claimed.length > 0) setCollected(result.claimed);
        });
    }, [state.charted, state.claimedRewards, claimRewards]);
    // The planner (and its theme switch) is covered while the chart is open,
    // so the app theme read at mount stays current.
    const [isDayTheme] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "light");
    const [lightChart, setLightChart] = useState(
        () => typeof document !== "undefined" && document.documentElement.dataset.starChart === "day"
    );

    const themedSky = skyHasOwnPalette(appearance.sky)
        ? COSMETIC_CATALOG.find((item) => item.key === appearance.sky)?.name ?? "This sky"
        : null;

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
    // Choose your path: only packs whose prerequisites are owned get a card;
    // the rest are summarised so the page doesn't fill with locked cards.
    const offeredRegions = lockedRegions.filter((region) => meetsRegionPrerequisites(region, state.unlockedRegions));
    const furtherRegions = lockedRegions.length - offeredRegions.length;
    const upcoming = ownedRegions
        .map((region) => nextUnlock(region.id, state.lifetimeStarlight))
        .filter((constellation): constellation is Constellation => constellation !== null)
        .sort((a, b) => a.unlockAt - b.unlockAt)[0] ?? null;
    const selected = selectedId ? CONSTELLATIONS.find((constellation) => constellation.id === selectedId) ?? null : null;
    const fullyCharted = visible.filter(
        (constellation) => chartedIndexes(constellation.id, state.charted).size >= constellation.stars.length
    ).length;

    const tabs = beta ? (
        <div data-tour="chart-tabs" role="tablist" aria-label="Star Chart sections" className="mt-6 inline-flex rounded-full border border-[var(--ls-line)] p-1">
            {TABS.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`star-chart-tab-${item.id}`}
                    aria-selected={tab === item.id}
                    onClick={() => setTab(item.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)] ${
                        tab === item.id
                            ? "bg-[var(--ls-gold)] text-[var(--ls-navy)]"
                            : "text-[var(--ls-muted)] hover:text-[var(--ls-ivory)]"
                    }`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    ) : null;

    return (
        <div
            className="sky star-chart relative min-h-full overflow-hidden bg-[var(--ls-night)] text-[var(--ls-ivory)]"
            data-sky={cosmeticVariant(appearance.sky)}
            data-lines={cosmeticVariant(appearance.lines)}
            data-sky-palette={skyHasOwnPalette(appearance.sky) ? "" : undefined}
            // Set inline: a url(#…) written in globals.css resolves against the
            // bundled stylesheet's URL and finds no filter.
            style={{ "--ls-sketch": "url(#ls-sketch)" } as React.CSSProperties}
        >
            {/* Hand-drawn look for the Pencil Sketch lines (globals.css): a
                gently bent stroke, a fainter second pass that strays further,
                both masked by fine grain like graphite on paper.
                userSpaceOnUse: a horizontal line has a zero-height bounding box,
                which would hide it under the default region. Sized to the
                figures' -6..106 viewBox. */}
            <svg width="0" height="0" className="absolute" aria-hidden="true">
                <filter id="ls-sketch" filterUnits="userSpaceOnUse" x="-20" y="-20" width="152" height="152">
                    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="2" result="bend" />
                    <feDisplacementMap in="SourceGraphic" in2="bend" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="stroke" />
                    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="1" seed="11" result="stray" />
                    <feDisplacementMap in="SourceGraphic" in2="stray" scale="7" xChannelSelector="G" yChannelSelector="R" result="secondPass" />
                    <feColorMatrix in="secondPass" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.45 0" result="faintPass" />
                    <feMerge result="strokes">
                        <feMergeNode in="faintPass" />
                        <feMergeNode in="stroke" />
                    </feMerge>
                    <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="4" result="noise" />
                    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.9" result="grain" />
                    <feComposite in="strokes" in2="grain" operator="in" />
                </filter>
            </svg>
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
                        {isDayTheme && (themedSky ? (
                            // A bought sky keeps its own colours in Day mode; the
                            // saved light-chart choice returns with Deep Navy.
                            <p className="max-w-56 text-xs text-[var(--ls-muted)]">
                                {themedSky} sets its own colours. Switch to Deep Navy for the light chart.
                            </p>
                        ) : (
                            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ls-muted)]">
                                Light chart
                                <Switch checked={lightChart} onChange={updateLightChart} ariaLabel="Light chart" />
                            </label>
                        ))}
                        <button
                            type="button"
                            onClick={onBack}
                            className="rounded-full border border-[var(--ls-line)] px-4 py-2 text-sm font-semibold text-[var(--ls-ivory)] transition-colors hover:border-[var(--ls-gold)]"
                        >
                            Back to Ship&apos;s Log
                        </button>
                    </div>
                </div>

                {tabs}

                {tab === "chart" && (
                    <>
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
                            ) : hiddenInPacks(ownedRegions, visible) > 0 ? (
                                <span className="text-base">Finish one to reveal more</span>
                            ) : offeredRegions.length > 0 ? (
                                <span className="text-base">{offeredRegions[0].name}, below</span>
                            ) : (
                                <span className="text-base">All discovered</span>
                            )}
                        </Stat>
                    </dl>

                    {collected.length > 0 && (
                        <div className="ls-celebrate-fast mt-4 rounded-2xl border border-[var(--ls-gold)]/50 px-4 py-3 text-sm" aria-live="polite">
                            <span className="ls-eyebrow mr-2 text-[var(--ls-gold)]">Collected</span>
                            {collected.map((reward) => `${reward.name} +${reward.bounty}`).join(" · ")}
                        </div>
                    )}

                    <LegendsStrip />

                    {ownedRegions.map((region, index) => {
                        const regionVisible = visible.filter((constellation) => constellation.region === region.id);
                        const regionNext = nextUnlock(region.id, state.lifetimeStarlight);
                        const regionRemaining = CONSTELLATIONS.filter(
                            (constellation) => constellation.region === region.id && !regionVisible.includes(constellation)
                        ).length;

                        const lit = isRegionComplete(region.id, state.charted);

                        return (
                            <section key={region.id} className="mt-8">
                                {(ownedRegions.length > 1 || lit) && (
                                    <h2 className="mb-3 flex flex-wrap items-center gap-3 font-[family-name:var(--font-spectral)] text-2xl">
                                        {region.name}
                                        {lit && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ls-gold)]/60 px-2.5 py-0.5 font-[family-name:var(--font-manrope)] text-xs font-semibold text-[var(--ls-gold)]">
                                                <StarIcon size={12} />
                                                Lit
                                            </span>
                                        )}
                                    </h2>
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
                                    {!regionNext && regionRemaining > 0 && (
                                        <li>
                                            <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ls-line)] p-4 text-center">
                                                <p className="font-[family-name:var(--font-spectral)] text-lg text-[var(--ls-muted)]">Uncharted sky</p>
                                                <p className="mt-1 text-xs text-[var(--ls-muted)]">
                                                    Fully chart a constellation here to reveal the next.
                                                </p>
                                                <p className="mt-2 text-xs text-[var(--ls-muted)]">
                                                    {regionRemaining} still hidden.
                                                </p>
                                            </div>
                                        </li>
                                    )}
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

                    {offeredRegions.length > 0 && (
                        <div className={`mt-10 grid gap-4 ${offeredRegions.length > 1 ? "lg:grid-cols-2" : ""}`}>
                            {offeredRegions.map((region) => (
                                <ExpansionCard key={region.id} region={region} choice={offeredRegions.length > 1} />
                            ))}
                        </div>
                    )}
                    {furtherRegions > 0 && (
                        <p className="mt-4 text-center text-xs text-[var(--ls-muted)]">
                            {furtherRegions} more {furtherRegions === 1 ? "expansion lies" : "expansions lie"} further out. Open a region to see
                            where it leads.
                        </p>
                    )}
                    </>
                )}

                {tab === "galaxy" && <GalaxyView onChartTab={() => setTab("chart")} />}
                {tab === "nebula" && <NebulaPanel />}
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
function ExpansionCard({ region, choice }: { region: SkyRegion; choice: boolean }) {
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
        <section className="rounded-3xl border border-dashed border-[var(--ls-gold)]/50 bg-[var(--ls-tile)] p-5 sm:p-7">
            <p className="ls-eyebrow text-[var(--ls-gold)]">
                {choice ? "Choose your path" : "Expansion"} · {count} constellations
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-spectral)] text-2xl">{region.name}</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--ls-muted)]">{region.description}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                {!inReach ? (
                    <p className="text-sm text-[var(--ls-muted)]">
                        {region.id === "southern" ? "Discover every constellation in your sky first" : "Opens with more lifetime Starlight"}
                        : {state.lifetimeStarlight} of {region.requiresLifetime}.
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

// Constellations in owned progress-reveal packs still waiting to appear.
function hiddenInPacks(ownedRegions: SkyRegion[], visible: Constellation[]): number {
    return ownedRegions
        .filter((region) => region.reveal === "progress")
        .reduce((sum, region) => sum + regionConstellations(region.id).filter((constellation) => !visible.includes(constellation)).length, 0);
}

// One-time set bonuses. A legend shows once any constellation in it has
// appeared, so new ones surface as the sky grows.
function LegendsStrip() {
    const { state } = useStarChart();
    const shown = LEGENDS.filter((legend) =>
        legendParts(legend).some((part) => {
            const constellation = CONSTELLATIONS.find((item) => item.id === part.constellationId);
            return constellation && isVisible(constellation, state.lifetimeStarlight, state.charted, state.unlockedRegions);
        })
    );
    const hidden = LEGENDS.length - shown.length;

    if (shown.length === 0) return null;

    return (
        <section className="mt-6" aria-labelledby="legends-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="legends-heading" className="font-[family-name:var(--font-spectral)] text-xl">Legends</h2>
                <p className="text-xs text-[var(--ls-muted)]">
                    Chart a whole set for a one-time Starlight bounty{hidden > 0 ? ` · ${hidden} more to discover` : ""}.
                </p>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((legend) => {
                    const { done, total } = legendProgress(legend, state.charted);
                    const claimed = state.claimedRewards.includes(legendRewardId(legend.id));

                    return (
                        <li
                            key={legend.id}
                            className={`rounded-2xl border px-4 py-3 ${claimed ? "border-[var(--ls-gold)]/60" : "border-[var(--ls-line)]"} bg-[var(--ls-tile)]`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p className="font-[family-name:var(--font-spectral)] text-lg leading-tight">{legend.name}</p>
                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--ls-gold)]">
                                    <StarIcon size={12} />
                                    {claimed ? "Earned" : `+${legend.bounty}`}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-[var(--ls-muted)]">{legend.description}</p>
                            <div
                                className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ls-line)]"
                                role="progressbar"
                                aria-label={`${legend.name} progress`}
                                aria-valuemin={0}
                                aria-valuemax={total}
                                aria-valuenow={done}
                            >
                                <div className="h-full rounded-full bg-[var(--ls-gold)]" style={{ width: `${(done / total) * 100}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-[var(--ls-muted)]">
                                {done} of {total}
                            </p>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
