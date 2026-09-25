"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ChartedStarRef } from "@/lib/constellations";
import { chartStar, getStarChart, type ChartStarResult, type StarChartState } from "@/lib/starChart";

type StarChartContextValue = {
    state: StarChartState;
    // Applies the balance the server returned from an XP award
    // (POST /api/gamification) — Starlight is only ever earned there.
    applyBalance: (balance: { starlight: number; lifetimeStarlight: number }) => void;
    chart: (constellationId: string, starIndex: number) => Promise<ChartStarResult>;
    markOnboarded: (onboardedAt: string | null) => void;
};

const EMPTY_STATE: StarChartState = { starlight: 0, lifetimeStarlight: 0, onboardedAt: null, charted: [] };

// Shared between the Ship's Log (which earns Starlight on task completion and
// shows the balance in the taskbar) and the Star Chart (which spends it) —
// they're siblings under LaptopFrame, so a context keeps one balance.
const StarChartContext = createContext<StarChartContextValue>({
    state: EMPTY_STATE,
    applyBalance: () => {},
    chart: async () => ({ ok: false, error: "The star chart isn't available here." }),
    markOnboarded: () => {},
});

export function useStarChart(): StarChartContextValue {
    return useContext(StarChartContext);
}

type Props = {
    initialState: StarChartState;
    children: ReactNode;
};

export function StarChartProvider({ initialState, children }: Props) {
    const [state, setState] = useState<StarChartState>(initialState);

    // Balances always come back from the server's increment/decrement, so the
    // client never computes (and can never clobber) the authoritative total.
    const applyBalance = useCallback((balance: { starlight: number; lifetimeStarlight: number }) => {
        setState((current) => ({ ...current, starlight: balance.starlight, lifetimeStarlight: balance.lifetimeStarlight }));
    }, []);

    const chart = useCallback(async (constellationId: string, starIndex: number) => {
        const result = await chartStar(constellationId, starIndex);

        if (result.ok) {
            const charted: ChartedStarRef[] = result.charted;
            setState((current) => ({
                ...current,
                starlight: result.starlight,
                lifetimeStarlight: result.lifetimeStarlight,
                charted,
            }));
        } else {
            // A 409 (already charted, or not enough Starlight because another
            // tab spent it) means this view is stale — resync it.
            const fresh = await getStarChart();

            if (fresh) {
                setState((current) => ({ ...fresh, onboardedAt: current.onboardedAt }));
            }
        }

        return result;
    }, []);

    const markOnboarded = useCallback((onboardedAt: string | null) => {
        setState((current) => ({ ...current, onboardedAt }));
    }, []);

    const value = useMemo(() => ({ state, applyBalance, chart, markOnboarded }), [state, applyBalance, chart, markOnboarded]);

    return <StarChartContext.Provider value={value}>{children}</StarChartContext.Provider>;
}
