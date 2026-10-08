"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_LOADOUT, type CosmeticSlot } from "@/lib/cosmetics";
import {
    buyCosmetic,
    equipCosmetic,
    getCosmetics,
    renameShip,
    type BuyCosmeticResult,
    type CosmeticsState,
    type EquipCosmeticResult,
    type RenameShipResult,
} from "@/lib/cosmeticsApi";
import { useStarChart } from "@/components/starchart/StarChartContext";

type Loadout = Record<CosmeticSlot, string>;

type CosmeticsContextValue = {
    enabled: boolean;
    status: "idle" | "loading" | "ready" | "error";
    cosmetics: CosmeticsState | null;
    // What the Star Chart and Galaxy render: equipped, overlaid by any
    // preview, or the defaults when the beta is off.
    appearance: Loadout;
    preview: Partial<Loadout>;
    setPreview: (preview: Partial<Loadout>) => void;
    ensureLoaded: () => void;
    buy: (key: string) => Promise<BuyCosmeticResult>;
    equip: (key: string) => Promise<EquipCosmeticResult>;
    rename: (name: string) => Promise<RenameShipResult>;
};

const DISABLED = { ok: false as const, error: "The Nebula isn't available right now." };

const CosmeticsContext = createContext<CosmeticsContextValue>({
    enabled: false,
    status: "idle",
    cosmetics: null,
    appearance: DEFAULT_LOADOUT,
    preview: {},
    setPreview: () => {},
    ensureLoaded: () => {},
    buy: async () => DISABLED,
    equip: async () => DISABLED,
    rename: async () => DISABLED,
});

export function useCosmetics(): CosmeticsContextValue {
    return useContext(CosmeticsContext);
}

type Props = {
    enabled: boolean;
    children: ReactNode;
};

// Fetched once per page session, the first time the Star Chart opens (not on
// every planner load: only the chart uses it). Mutations apply the server's
// response instead of refetching; nothing polls.
export function CosmeticsProvider({ enabled, children }: Props) {
    const { applyBalance, setShipName } = useStarChart();
    const [status, setStatus] = useState<CosmeticsContextValue["status"]>("idle");
    const [cosmetics, setCosmetics] = useState<CosmeticsState | null>(null);
    const [preview, setPreview] = useState<Partial<Loadout>>({});
    const loading = useRef(false);

    const ensureLoaded = useCallback(() => {
        if (!enabled || loading.current) return;

        loading.current = true;
        setStatus("loading");
        getCosmetics().then((result) => {
            if (result) {
                setCosmetics(result);
                setStatus("ready");
            } else {
                // Allow a retry on the next open.
                loading.current = false;
                setStatus("error");
            }
        });
    }, [enabled]);

    const buy = useCallback(async (key: string) => {
        if (!enabled) return DISABLED;

        const result = await buyCosmetic(key);

        if (result.ok) {
            setCosmetics((current) => current && !current.owned.includes(key)
                ? { ...current, owned: [...current.owned, key] }
                : current);

            if (result.starlight !== null && result.lifetimeStarlight !== null) {
                applyBalance({ starlight: result.starlight, lifetimeStarlight: result.lifetimeStarlight });
            }
        }

        return result;
    }, [enabled, applyBalance]);

    const equip = useCallback(async (key: string) => {
        if (!enabled) return DISABLED;

        const result = await equipCosmetic(key);

        if (result.ok) {
            setCosmetics((current) => current && { ...current, loadout: { ...current.loadout, [result.slot]: result.key } });
            setPreview((current) => {
                const next = { ...current };
                delete next[result.slot];
                return next;
            });
        }

        return result;
    }, [enabled]);

    const rename = useCallback(async (name: string) => {
        if (!enabled) return DISABLED;

        const result = await renameShip(name);

        if (result.ok) {
            setShipName(result.shipName);
            applyBalance({ starlight: result.starlight, lifetimeStarlight: result.lifetimeStarlight });
        }

        return result;
    }, [enabled, applyBalance, setShipName]);

    const appearance = useMemo<Loadout>(
        () => (enabled ? { ...DEFAULT_LOADOUT, ...cosmetics?.loadout, ...preview } : DEFAULT_LOADOUT),
        [enabled, cosmetics, preview]
    );

    const value = useMemo(
        () => ({ enabled, status, cosmetics, appearance, preview, setPreview, ensureLoaded, buy, equip, rename }),
        [enabled, status, cosmetics, appearance, preview, ensureLoaded, buy, equip, rename]
    );

    return <CosmeticsContext.Provider value={value}>{children}</CosmeticsContext.Provider>;
}
