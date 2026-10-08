"use client";

import { useState } from "react";
import { useCosmetics } from "@/components/starchart/CosmeticsContext";
import { useStarChart } from "@/components/starchart/StarChartContext";
import CosmeticThumbnail from "@/components/starchart/CosmeticThumbnail";
import { CheckIcon, LockIcon, StarIcon } from "@/components/brand/Icons";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/Spinner";
import { CONSTELLATIONS, isComplete } from "@/lib/constellations";
import {
    COSMETIC_SLOTS,
    SHIP_NAME_CHANGE_COST,
    SHIP_NAME_MAX_LENGTH,
    normalizeShipName,
    type CosmeticItemView,
    type CosmeticSlot,
} from "@/lib/cosmetics";

type Category = CosmeticSlot | "ship";

type ItemStatus = {
    owned: boolean;
    equipped: boolean;
    lockReason: string | null;
    shortfall: number;
};

const BUTTON_PRIMARY =
    "inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--ls-gold)] px-5 py-2.5 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ls-night)] disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_QUIET =
    "rounded-full border border-[var(--ls-line)] px-4 py-2 text-sm font-semibold text-[var(--ls-muted)] transition-colors hover:text-[var(--ls-ivory)] focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)] disabled:opacity-50";

function useItemStatus(): (item: CosmeticItemView) => ItemStatus {
    const { state } = useStarChart();
    const { cosmetics } = useCosmetics();
    const completeCount = CONSTELLATIONS.filter((constellation) => isComplete(constellation, state.charted)).length;

    return (item) => {
        const owned = item.cost === 0 || Boolean(cosmetics?.owned.includes(item.key));
        const lockReason = owned
            ? null
            : item.minLifetime && state.lifetimeStarlight < item.minLifetime
                ? `Unlocks at ${item.minLifetime} lifetime Starlight`
                : item.minConstellations && completeCount < item.minConstellations
                    ? `Fully chart ${item.minConstellations} constellations (${completeCount} so far)`
                    : null;

        return {
            owned,
            equipped: cosmetics?.loadout[item.slot] === item.key,
            lockReason,
            shortfall: owned ? 0 : item.cost - state.starlight,
        };
    };
}

// The cosmetics shop. Picking an item previews it across the whole Star
// Chart client-side (no write); buying and equipping go through
// /api/cosmetics.
export default function NebulaPanel() {
    const { state } = useStarChart();
    const { status, cosmetics, ensureLoaded, appearance, preview, setPreview } = useCosmetics();
    const statusOf = useItemStatus();
    const [category, setCategory] = useState<Category>("sky");

    const itemsBySlot = (slot: CosmeticSlot) =>
        (cosmetics?.items ?? []).filter((item) => item.slot === slot).sort((a, b) => a.sortOrder - b.sortOrder);

    const categories: { id: Category; label: string; count: string | null }[] = [
        ...COSMETIC_SLOTS.map((slot) => {
            const items = itemsBySlot(slot.id);
            return {
                id: slot.id as Category,
                label: slot.id === "sky" ? "Skies" : "Lines",
                count: cosmetics ? `${items.filter((item) => statusOf(item).owned).length}/${items.length}` : null,
            };
        }),
        { id: "ship", label: "Ship name", count: null },
    ];

    const slot = category === "ship" ? null : category;
    const items = slot ? itemsBySlot(slot) : [];
    const selectedKey = slot ? appearance[slot] : null;
    const selected = items.find((item) => item.key === selectedKey) ?? null;
    const hasPreview = Object.keys(preview).length > 0;

    function pick(item: CosmeticItemView) {
        const next = { ...preview };
        if (cosmetics?.loadout[item.slot] === item.key) delete next[item.slot];
        else next[item.slot] = item.key;
        setPreview(next);
    }

    return (
        <div className="mt-6" role="tabpanel" aria-labelledby="star-chart-tab-nebula">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="ls-eyebrow text-[var(--ls-gold)]">The Nebula</p>
                    <h2 className="mt-1 font-[family-name:var(--font-spectral)] text-2xl sm:text-3xl">Outfit your sky</h2>
                    <p className="mt-1 max-w-md text-sm text-[var(--ls-muted)]">
                        Appearance only: buy once, keep forever. Cosmetics never change Starlight, prices or your planner.
                    </p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--ls-line)] bg-[var(--ls-navy-raised)] px-4 py-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ls-gold)]/15 text-[var(--ls-gold)]">
                        <StarIcon size={18} />
                    </span>
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ls-muted)]">Starlight to spend</p>
                        <p className="font-[family-name:var(--font-spectral)] text-xl leading-tight text-[var(--ls-gold)]">{state.starlight}</p>
                    </div>
                </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap gap-1 rounded-full border border-[var(--ls-line)] p-1" aria-label="Shop sections">
                    {categories.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-pressed={category === item.id}
                            onClick={() => setCategory(item.id)}
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)] ${
                                category === item.id
                                    ? "bg-[var(--ls-gold)] text-[var(--ls-navy)]"
                                    : "text-[var(--ls-muted)] hover:text-[var(--ls-ivory)]"
                            }`}
                        >
                            {item.label}
                            {item.count && (
                                <span className={`text-xs font-medium ${category === item.id ? "opacity-70" : "opacity-60"}`}>{item.count}</span>
                            )}
                        </button>
                    ))}
                </div>
                {hasPreview && (
                    <button type="button" onClick={() => setPreview({})} className="text-sm font-semibold text-[var(--ls-gold)] hover:underline">
                        Back to my look
                    </button>
                )}
            </div>

            {category === "ship" ? (
                <ShipNameCard />
            ) : status === "error" ? (
                <div className="mt-6 rounded-2xl border border-[var(--ls-line)] p-4 text-sm">
                    <p>Couldn&apos;t load the Nebula.</p>
                    <button type="button" onClick={ensureLoaded} className={`mt-2 ${BUTTON_QUIET}`}>
                        Try again
                    </button>
                </div>
            ) : !cosmetics ? (
                <div aria-busy="true">
                    <span className="sr-only">Loading the Nebula…</span>
                    <Skeleton className="mt-5 h-64 rounded-3xl" />
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {Array.from({ length: 8 }, (_, index) => (
                            <Skeleton key={index} className="h-40 rounded-2xl" />
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {selected && <FittingRoom key={selected.key} item={selected} />}

                    <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {items.map((item) => (
                            <li key={item.key}>
                                <ProductCard item={item} selected={item.key === selectedKey} onPick={() => pick(item)} />
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

function ProductCard({ item, selected, onPick }: { item: CosmeticItemView; selected: boolean; onPick: () => void }) {
    const { appearance } = useCosmetics();
    const { owned, equipped, lockReason, shortfall } = useItemStatus()(item);

    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onPick}
            className={`group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-[var(--ls-tile)] text-left transition focus-visible:ring-2 focus-visible:ring-[var(--ls-gold)] ${
                selected
                    ? "border-[var(--ls-gold)] shadow-[0_0_0_1px_var(--ls-gold)]"
                    : "border-[var(--ls-line)] hover:-translate-y-0.5 hover:border-[var(--ls-gold)]/60"
            }`}
        >
            <div className="relative">
                <CosmeticThumbnail
                    sky={item.slot === "sky" ? item.key : appearance.sky}
                    lines={item.slot === "lines" ? item.key : appearance.lines}
                    className={lockReason ? "opacity-45 grayscale-[60%]" : ""}
                />
                {equipped && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--ls-gold)] px-2 py-0.5 text-[11px] font-bold text-[var(--ls-navy)]">
                        <CheckIcon size={11} strokeWidth={2.5} />
                        Equipped
                    </span>
                )}
                {lockReason && (
                    <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ls-scrim)] text-[var(--ls-ivory)]">
                            <LockIcon size={16} />
                        </span>
                    </span>
                )}
            </div>
            <div className="flex flex-1 items-center justify-between gap-2 px-3 py-2.5">
                <span className="min-w-0 truncate font-[family-name:var(--font-spectral)] text-base leading-tight">{item.name}</span>
                {equipped ? null : owned ? (
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--ls-muted)]">Owned</span>
                ) : (
                    <PriceTag cost={item.cost} muted={Boolean(lockReason) || shortfall > 0} />
                )}
            </div>
        </button>
    );
}

function PriceTag({ cost, muted, large = false }: { cost: number; muted: boolean; large?: boolean }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold ${
                large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs"
            } ${muted ? "bg-[var(--ls-line)] text-[var(--ls-muted)]" : "bg-[var(--ls-gold)]/15 text-[var(--ls-gold)]"}`}
        >
            <StarIcon size={large ? 14 : 11} />
            {cost}
        </span>
    );
}

// The selected item, large, with its buy / equip action. Keyed on the item
// so the confirm step resets when the selection changes.
function FittingRoom({ item }: { item: CosmeticItemView }) {
    const { state } = useStarChart();
    const { appearance, buy, equip } = useCosmetics();
    const { owned, equipped, lockReason, shortfall } = useItemStatus()(item);
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
        setPending(true);
        setError(null);
        const result = await action();
        setPending(false);
        setConfirming(false);
        if (!result.ok) setError(result.error ?? "Something went wrong.");
    }

    return (
        <section
            className="mt-5 grid gap-5 rounded-3xl border border-[var(--ls-line)] bg-[var(--ls-tile)] p-3 sm:p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-center"
            aria-label={`Selected: ${item.name}`}
        >
            <CosmeticThumbnail sky={appearance.sky} lines={appearance.lines} className="rounded-2xl" />

            <div className="px-1 pb-1 md:pr-3">
                <p className="ls-eyebrow text-[var(--ls-muted)]">{item.slot === "sky" ? "Sky" : "Constellation lines"}</p>
                <h3 className="mt-1 font-[family-name:var(--font-spectral)] text-3xl leading-tight">{item.name}</h3>
                <p className="mt-2 text-sm text-[var(--ls-muted)]">{item.description}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {equipped ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ls-gold)]/15 px-3 py-1 text-sm font-bold text-[var(--ls-gold)]">
                            <CheckIcon size={13} strokeWidth={2.5} />
                            Equipped
                        </span>
                    ) : owned ? (
                        <span className="text-sm font-semibold text-[var(--ls-muted)]">{item.cost === 0 ? "Free" : "Owned"}</span>
                    ) : (
                        <PriceTag cost={item.cost} muted={Boolean(lockReason) || shortfall > 0} large />
                    )}
                </div>

                {lockReason && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--ls-muted)]">
                        <LockIcon size={14} />
                        {lockReason}.
                    </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {equipped ? null : owned ? (
                        <button type="button" disabled={pending} onClick={() => run(() => equip(item.key))} className={BUTTON_PRIMARY}>
                            {pending && <Spinner className="h-3.5 w-3.5" />}
                            {pending ? "Equipping…" : "Equip"}
                        </button>
                    ) : confirming ? (
                        <>
                            <button type="button" disabled={pending} onClick={() => run(() => buy(item.key))} className={BUTTON_PRIMARY}>
                                {pending && <Spinner className="h-3.5 w-3.5" />}
                                {pending ? "Buying…" : `Spend ${item.cost}`}
                            </button>
                            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={BUTTON_QUIET}>
                                Not yet
                            </button>
                        </>
                    ) : lockReason ? null : (
                        <button
                            type="button"
                            disabled={shortfall > 0}
                            onClick={() => {
                                setConfirming(true);
                                setError(null);
                            }}
                            className={BUTTON_PRIMARY}
                        >
                            <StarIcon size={13} />
                            Buy
                        </button>
                    )}
                </div>

                {!owned && !lockReason && shortfall > 0 && (
                    <p className="mt-2 text-xs text-[var(--ls-muted)]">You need {shortfall} more Starlight.</p>
                )}
                {confirming && (
                    <p className="mt-2 text-xs text-[var(--ls-muted)]">Leaves you {state.starlight - item.cost} Starlight. No refunds.</p>
                )}
                {error && <p className="mt-2 text-xs text-[var(--ls-error)]">{error}</p>}
                {!equipped && !confirming && (
                    <p className="mt-3 text-xs text-[var(--ls-muted)]">Previewing across your whole chart. Nothing changes until you equip it.</p>
                )}
            </div>
        </section>
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
    const plaqueName = draft.trim() || state.shipName || "Unnamed vessel";

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
        <section
            className="mt-5 grid gap-5 rounded-3xl border border-[var(--ls-line)] bg-[var(--ls-tile)] p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-center"
            aria-labelledby="nebula-ship-name"
        >
            {/* Brass nameplate preview. */}
            <div className="flex aspect-[16/10] items-center justify-center rounded-2xl bg-[var(--ls-night)] p-6" aria-hidden="true">
                <div className="w-full max-w-sm rounded-xl bg-gradient-to-b from-[#e9c46a] via-[#b7892a] to-[#8a6418] p-[3px] shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
                    <div className="rounded-[10px] bg-gradient-to-b from-[#f1d68e] to-[#c99a3a] px-5 py-4 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#5c4210]">Ship&apos;s Log of</p>
                        <p className="mt-1 truncate font-[family-name:var(--font-spectral)] text-2xl text-[#2b1d05]">{plaqueName}</p>
                    </div>
                </div>
            </div>

            <div className="px-1 pb-1 md:pr-3">
                <p className="ls-eyebrow text-[var(--ls-muted)]">Nameplate</p>
                <h3 id="nebula-ship-name" className="mt-1 font-[family-name:var(--font-spectral)] text-3xl leading-tight">Ship name</h3>
                <p className="mt-2 text-sm text-[var(--ls-muted)]">Only you see it, under the Ship&apos;s Log title.</p>
                <div className="mt-3">
                    {free ? (
                        <span className="text-sm font-semibold text-[var(--ls-gold)]">First name is free</span>
                    ) : (
                        <PriceTag cost={SHIP_NAME_CHANGE_COST} muted={shortfall > 0} large />
                    )}
                </div>
                <form
                    className="mt-4 flex flex-wrap items-center gap-2"
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
                        className={BUTTON_PRIMARY}
                    >
                        {pending && <Spinner className="h-3.5 w-3.5" />}
                        {pending ? "Saving…" : free ? "Name it" : "Rename"}
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
            </div>
        </section>
    );
}
