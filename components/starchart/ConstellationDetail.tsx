"use client";

import { useState } from "react";
import { chartedIndexes, Constellation, starPrice } from "@/lib/constellations";
import { useStarChart } from "@/components/starchart/StarChartContext";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import { StarIcon } from "@/components/brand/Icons";

type Props = {
    constellation: Constellation;
    onClose: () => void;
};

export default function ConstellationDetail({ constellation, onClose }: Props) {
    const { state, chart } = useStarChart();
    const [selected, setSelected] = useState<number | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [igniting, setIgniting] = useState<Set<number>>(new Set());
    const [celebrating, setCelebrating] = useState(false);

    const charted = chartedIndexes(constellation.id, state.charted);
    const price = starPrice(constellation);
    const complete = charted.size >= constellation.stars.length;
    const selectedStar = selected === null ? null : constellation.stars[selected];
    const shortfall = price - state.starlight;

    async function handleChart() {
        if (selected === null) return;

        setPending(true);
        setError(null);

        const result = await chart(constellation.id, selected);

        setPending(false);

        if (!result.ok) {
            setError(result.error);
            return;
        }

        setIgniting(new Set([selected]));
        setSelected(null);

        if (result.completedConstellation) {
            setCelebrating(true);
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`${constellation.name} star chart`}
            className="absolute inset-0 z-20 flex items-center justify-center bg-[rgb(10_12_28/0.72)] p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="relative w-full max-w-xl rounded-3xl border border-[var(--ls-line)] bg-[var(--ls-night)] p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="font-[family-name:var(--font-spectral)] text-2xl text-[var(--ls-ivory)]">
                            {constellation.name}
                        </h2>
                        {constellation.commonName && (
                            <p className="text-sm text-[var(--ls-muted)]">{constellation.commonName}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--ls-line)] px-3 py-1.5 text-xs font-semibold text-[var(--ls-muted)] transition-colors hover:text-[var(--ls-ivory)]"
                    >
                        Close
                    </button>
                </div>

                <p className="mt-2 text-xs text-[var(--ls-muted)]">
                    {charted.size} of {constellation.stars.length} stars charted · {price} Starlight per star
                </p>

                <div className="relative mx-auto mt-4 aspect-square w-full max-w-[380px]">
                    <ConstellationFigure
                        constellation={constellation}
                        charted={charted}
                        igniting={igniting}
                        celebrate={celebrating}
                        className="absolute inset-0 h-full w-full"
                    />
                    {/* Real buttons over each uncharted star, positioned in the
                        same 112-unit box the SVG uses (viewBox -6..106). */}
                    {constellation.stars.map((star, index) =>
                        charted.has(index) ? null : (
                            <button
                                key={index}
                                type="button"
                                onClick={() => {
                                    setSelected(index);
                                    setError(null);
                                }}
                                aria-pressed={selected === index}
                                aria-label={`Select ${star.name ?? `star ${index + 1}`}`}
                                className={`absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)] ${
                                    selected === index ? "ring-2 ring-[var(--ls-gold)]" : "hover:ring-1 hover:ring-[var(--ls-gold)]/60"
                                }`}
                                style={{ left: `${((star.x + 6) / 112) * 100}%`, top: `${((star.y + 6) / 112) * 100}%` }}
                            />
                        )
                    )}
                </div>

                <div className="mt-4 min-h-[76px] rounded-2xl bg-[var(--ls-navy-raised)] p-4">
                    {celebrating ? (
                        <div className="ls-celebrate text-center">
                            <p className="ls-eyebrow text-[var(--ls-gold)]">Constellation complete</p>
                            <p className="mt-1 font-[family-name:var(--font-spectral)] text-xl text-[var(--ls-ivory)]">
                                {constellation.name} fully charted
                            </p>
                            {constellation.commonName && (
                                <p className="text-sm text-[var(--ls-muted)]">{constellation.commonName}, lit by your own work.</p>
                            )}
                        </div>
                    ) : complete ? (
                        <p className="text-center text-sm text-[var(--ls-muted)]">
                            Every star in {constellation.name} is charted.
                        </p>
                    ) : selectedStar ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[var(--ls-ivory)]">
                                    Chart {selectedStar.name ?? "this star"}
                                </p>
                                <p className="text-xs text-[var(--ls-muted)]">
                                    {shortfall > 0
                                        ? `You need ${shortfall} more Starlight. Finish a task to earn some.`
                                        : `${price} Starlight · you have ${state.starlight}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleChart}
                                disabled={pending || shortfall > 0}
                                className="inline-flex items-center gap-2 rounded-full bg-[var(--ls-gold)] px-5 py-2 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <StarIcon size={14} />
                                {pending ? "Charting…" : `Chart for ${price}`}
                            </button>
                        </div>
                    ) : (
                        <p className="text-center text-sm text-[var(--ls-muted)]">
                            Choose an uncharted star to spend Starlight on it.
                        </p>
                    )}

                    {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
                </div>
            </div>
        </div>
    );
}
