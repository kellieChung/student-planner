import { ChartedStarRef } from "@/lib/constellations";

export type StarChartState = {
    starlight: number;
    lifetimeStarlight: number;
    onboardedAt: string | null;
    charted: ChartedStarRef[];
};

export type ChartStarResult =
    | { ok: true; starlight: number; lifetimeStarlight: number; charted: ChartedStarRef[]; completedConstellation: boolean }
    | { ok: false; error: string };

export async function getStarChart(): Promise<StarChartState | null> {
    try {
        const response = await fetch("/api/star-chart");

        if (!response.ok) return null;

        const data = await response.json() as StarChartState;
        return {
            starlight: data.starlight,
            lifetimeStarlight: data.lifetimeStarlight,
            onboardedAt: data.onboardedAt,
            charted: data.charted,
        };
    } catch {
        return null;
    }
}

export async function chartStar(constellationId: string, starIndex: number): Promise<ChartStarResult> {
    try {
        const response = await fetch("/api/star-chart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "chart", constellationId, starIndex }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            return { ok: false, error: typeof data.error === "string" ? data.error : "Couldn't chart that star." };
        }

        return {
            ok: true,
            starlight: data.starlight,
            lifetimeStarlight: data.lifetimeStarlight,
            charted: data.charted,
            completedConstellation: data.completedConstellation,
        };
    } catch {
        return { ok: false, error: "Couldn't reach the star chart. Check your connection and try again." };
    }
}

export async function saveOnboarded(onboardedAt: string | null): Promise<void> {
    try {
        await fetch("/api/star-chart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ onboardedAt }),
        });
    } catch (error) {
        console.error("Could not save onboarding", error);
    }
}
