"use client";

import { useState } from "react";
import { useCosmetics } from "@/components/starchart/CosmeticsContext";
import { useStarChart } from "@/components/starchart/StarChartContext";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import { StarIcon } from "@/components/brand/Icons";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/Spinner";
import { CONSTELLATIONS, isComplete } from "@/lib/constellations";
import {
    COSMETIC_SLOTS,
    SHIP_NAME_CHANGE_COST,
    SHIP_NAME_MAX_LENGTH,
    normalizeShipName,
    type CosmeticItemView,
} from "@/lib/cosmetics";

const SAMPLE = CONSTELLATIONS.find((constellation) => constellation.id === "orion")!;
const SAMPLE_CHARTED = new Set(SAMPLE.stars.map((_, index) => index));

// The cosmetics shop. Previewing re-skins the whole Star Chart client-side
// (no write); buying and equipping go through /api/cosmetics.
export default function NebulaPanel() {
    const { state } = useStarChart();
    const { status, cosmetics, ensureLoaded } = useCosmetics();

    return (
        <div className="mt-6" role="tabpanel" aria-labelledby="star-chart-tab-nebula">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="font-[family-name:var(--font-spectral)] text-2xl">Nebula</h2>
                    <p className="mt-1 max-w-md text-sm text-[var(--ls-muted)]">
                        Change how your sky looks. Cosmetics are appearance only: buy once, keep forever, and they never affect
                        Starlight, prices or your planner.
                    </p>
                </div>
                <p className="inline-flex items-center gap-1.5 rounded-2xl bg-[var(--ls-navy-raised)] px-4 py-2 text-sm">
                    <span className="text-[var(--ls-muted)]">Starlight to spend</span>
                    <span className="inline-flex items-center gap-1 font-[family-name:var(--font-spectral)] text-lg text-[var(--ls-gold)]">
                        <StarIcon size={14} />
                        {state.starlight}
                    </span>
                </p>
            </div>

            <div className="mt-5 flex items-center justify-center rounded-3xl border border-[var(--ls-line)] p-6" aria-hidden="true">
                <ConstellationFigure constellation={SAMPLE} charted={SAMPLE_CHARTED} className="h-40 w-40" />
            </div>
            <p className="mt-2 text-center text-xs text-[var(--ls-muted)]">
                Preview: pick any item to see it across your sky. Nothing is saved until you equip it.
            </p>

            <ShipNameCard />

            {status === "error" && (
                <div className="mt-6 rounded-2xl border border-[var(--ls-line)] p-4 text-sm">
                    <p>Couldn&apos;t load the Nebula.</p>
                    <button
                        type="button"
                        onClick={ensureLoaded}
                        className="mt-2 rounded-full border border-[var(--ls-line)] px-4 py-1.5 text-xs font-semibold hover:border-[var(--ls-gold)]"
                    >
                        Try again
                    </button>
                </div>
            )}

            {(status === "loading" || status === "idle") && (
                <div aria-busy="true">
                    <span className="sr-only">Loading the Nebula…</span>
                    {[0, 1].map((section) => (
                        <div key={section} className="mt-8">
                            <Skeleton className="h-6 w-40" />
                            <Skeleton className="mt-2 h-3 w-64 max-w-full" />
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {[0, 1, 2, 3].map((card) => (
                                    <Skeleton key={card} className="h-40 rounded-2xl" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {cosmetics && COSMETIC_SLOTS.map((slot) => {
                const items = cosmetics.items
                    .filter((item) => item.slot === slot.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder);

                return (
                    <section key={slot.id} className="mt-8" aria-labelledby={`nebula-${slot.id}`}>
                        <h3 id={`nebula-${slot.id}`} className="font-[family-name:var(--font-spectral)] text-xl">{slot.name}</h3>
                        <p className="text-xs text-[var(--ls-muted)]">{slot.description}</p>
                        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {items.map((item) => (
                                <li key={item.key}>
                                    <CosmeticCard item={item} />
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

function CosmeticCard({ item }: { item: CosmeticItemView }) {
    const { state } = useStarChart();
    const { cosmetics, preview, setPreview, buy, equip } = useCosmetics();
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const owned = item.cost === 0 || Boolean(cosmetics?.owned.includes(item.key));
    const equipped = cosmetics?.loadout[item.slot] === item.key;
    const previewing = preview[item.slot] === item.key && !equipped;
    const completeCount = CONSTELLATIONS.filter((constellation) => isComplete(constellation, state.charted)).length;
    const lockReason = owned
        ? null
        : item.minLifetime && state.lifetimeStarlight < item.minLifetime
            ? `Unlocks at ${item.minLifetime} lifetime Starlight`
            : item.minConstellations && completeCount < item.minConstellations
                ? `Fully chart ${item.minConstellations} constellations (${completeCount} so far)`
                : null;
    const shortfall = item.cost - state.starlight;

    async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
        setPending(true);
        setError(null);
        const result = await action();
        setPending(false);
        setConfirming(false);
        if (!result.ok) setError(result.error ?? "Something went wrong.");
    }

    return (
        <div
            className={`flex h-full flex-col rounded-2xl border bg-[var(--ls-tile)] p-4 ${
                equipped ? "border-[var(--ls-gold)]" : previewing ? "border-[var(--ls-gold)]/60" : "border-[var(--ls-line)]"
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="font-[family-name:var(--font-spectral)] text-lg leading-tight">{item.name}</p>
                <span className="shrink-0 text-xs font-semibold text-[var(--ls-muted)]">
                    {equipped ? "Equipped" : owned ? "Owned" : lockReason ? "Locked" : (
                        <span className="inline-flex items-center gap-1 text-[var(--ls-gold)]">
                            <StarIcon size={12} />
                            {item.cost}
                        </span>
                    )}
                </span>
            </div>
            <p className="mt-1 flex-1 text-xs text-[var(--ls-muted)]">{item.description}</p>
            {lockReason && <p className="mt-2 text-xs text-[var(--ls-muted)]">{lockReason}.</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {!equipped && (
                    <button
                        type="button"
                        aria-pressed={previewing}
                        onClick={() => {
                            const next = { ...preview };
                            if (previewing) delete next[item.slot];
                            else next[item.slot] = item.key;
                            setPreview(next);
                        }}
                        className="rounded-full border border-[var(--ls-line)] px-3 py-1.5 text-xs font-semibold text-[var(--ls-muted)] transition-colors hover:text-[var(--ls-ivory)] focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)]"
                    >
                        {previewing ? "Stop preview" : "Preview"}
                    </button>
                )}

                {equipped ? (
                    <span className="rounded-full bg-[var(--ls-gold)]/15 px-3 py-1.5 text-xs font-bold text-[var(--ls-gold)]">Equipped</span>
                ) : owned ? (
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => equip(item.key))}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ls-gold)] px-3 py-1.5 text-xs font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] disabled:opacity-50"
                    >
                        {pending && <Spinner className="h-3 w-3" />}
                        {pending ? "Equipping…" : "Equip"}
                    </button>
                ) : confirming ? (
                    <>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => buy(item.key))}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ls-gold)] px-3 py-1.5 text-xs font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] disabled:opacity-50"
                        >
                            {pending && <Spinner className="h-3 w-3" />}
                            {pending ? "Buying…" : `Spend ${item.cost}`}
                        </button>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => setConfirming(false)}
                            className="rounded-full border border-[var(--ls-line)] px-3 py-1.5 text-xs font-semibold text-[var(--ls-muted)] hover:text-[var(--ls-ivory)]"
                        >
                            Not yet
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        disabled={Boolean(lockReason) || shortfall > 0}
                        onClick={() => {
                            setConfirming(true);
                            setError(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--ls-gold)] px-3 py-1.5 text-xs font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <StarIcon size={12} />
                        Buy · {item.cost}
                    </button>
                )}
            </div>
            {!owned && !lockReason && shortfall > 0 && (
                <p className="mt-2 text-xs text-[var(--ls-muted)]">You need {shortfall} more Starlight.</p>
            )}
            {confirming && (
                <p className="mt-2 text-xs text-[var(--ls-muted)]">
                    Leaves you {state.starlight - item.cost} Starlight. No refunds.
                </p>
            )}
            {error && <p className="mt-2 text-xs text-[var(--ls-error)]">{error}</p>}
        </div>
    );
}

function ShipNameCard() {
    const { state } = useStarChart();
    const { rename } = useCosmetics();
    const [draft, setDraft] = useState(state.shipName ?? "");
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

    const free = state.shipName === null;
    const parsed = normalizeShipName(draft);
    const unchanged = parsed.ok && parsed.name === state.shipName;
    const shortfall = free ? 0 : SHIP_NAME_CHANGE_COST - state.starlight;

    async function handleSave() {
        if (!parsed.ok) {
            setMessage({ tone: "error", text: parsed.error });
            return;
        }

        setPending(true);
        setMessage(null);
        const result = await rename(parsed.name);
        setPending(false);

        if (result.ok) {
            setDraft(result.shipName);
            setMessage({ tone: "ok", text: result.charged > 0 ? `Renamed for ${result.charged} Starlight.` : "Your ship is named." });
        } else {
            setMessage({ tone: "error", text: result.error });
        }
    }

    return (
        <section className="mt-8 rounded-2xl border border-[var(--ls-line)] bg-[var(--ls-tile)] p-4" aria-labelledby="nebula-ship-name">
            <h3 id="nebula-ship-name" className="font-[family-name:var(--font-spectral)] text-xl">Ship name</h3>
            <p className="text-xs text-[var(--ls-muted)]">
                Only you see it, under the Ship&apos;s Log title.{" "}
                {free ? "Naming your ship is free." : `Renaming costs ${SHIP_NAME_CHANGE_COST} Starlight.`}
            </p>
            <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleSave();
                }}
            >
                <label htmlFor="ship-name-input" className="sr-only">Ship name</label>
                <input
                    id="ship-name-input"
                    value={draft}
                    maxLength={SHIP_NAME_MAX_LENGTH}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="The Wandering Star"
                    className="min-w-0 flex-1 rounded-full border border-[var(--ls-line)] bg-[var(--ls-night)] px-4 py-2 text-sm text-[var(--ls-ivory)] placeholder:text-[var(--ls-muted)] focus-visible:border-[var(--ls-gold)]"
                />
                <button
                    type="submit"
                    disabled={pending || unchanged || draft.trim().length === 0 || shortfall > 0}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--ls-gold)] px-4 py-2 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {pending && <Spinner className="h-3.5 w-3.5" />}
                    {pending ? "Saving…" : free ? "Name it" : (
                        <>
                            <StarIcon size={12} />
                            Rename · {SHIP_NAME_CHANGE_COST}
                        </>
                    )}
                </button>
            </form>
            {!free && shortfall > 0 && !unchanged && (
                <p className="mt-2 text-xs text-[var(--ls-muted)]">You need {shortfall} more Starlight to rename.</p>
            )}
            {message && (
                <p className={`mt-2 text-xs ${message.tone === "error" ? "text-[var(--ls-error)]" : "text-[var(--ls-gold)]"}`} aria-live="polite">
                    {message.text}
                </p>
            )}
        </section>
    );
}
