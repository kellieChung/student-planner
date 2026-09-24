"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ChartedStarRef } from "@/lib/constellations";
import { chartStar, earnStarlight, type ChartStarResult, type StarChartState } from "@/lib/starChart";

type StarChartContextValue = {
    state: StarChartState;
    earn: (amount: number) => Promise<void>;
    chart: (constellationId: string, starIndex: number) => Promise<ChartStarResult>;
    markOnboarded: (onboardedAt: string | null) => void;
};

const EMPTY_STATE: StarChartState = { starlight: 0, lifetimeStarlight: 0, onboardedAt: null, charted: [] };

// Shared between the Ship's Log (which earns Starlight on task completion and
// shows the balance in the taskbar) and the Star Chart (which spends it) —
// they're siblings under LaptopFrame, so a context keeps one balance.
const StarChartContext = createContext<StarChartContextValue>({
    state: EMPTY_STATE,
    earn: async () => {},
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
    const earn = useCallback(async (amount: number) => {
        if (amount <= 0) return;

        setState((current) => ({
            ...current,
            starlight: current.starlight + amount,
            lifetimeStarlight: current.lifetimeStarlight + amount,
        }));

        const saved = await earnStarlight(amount);

        if (saved) {
            setState((current) => ({ ...current, starlight: saved.starlight, lifetimeStarlight: saved.lifetimeStarlight }));
        }
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
        }

        return result;
    }, []);

    const markOnboarded = useCallback((onboardedAt: string | null) => {
        setState((current) => ({ ...current, onboardedAt }));
    }, []);

    const value = useMemo(() => ({ state, earn, chart, markOnboarded }), [state, earn, chart, markOnboarded]);

    return <StarChartContext.Provider value={value}>{children}</StarChartContext.Provider>;
}
