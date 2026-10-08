import { ChartedStarRef } from "@/lib/constellations";
import type { Reward } from "@/lib/legends";

export type StarChartState = {
    starlight: number;
    lifetimeStarlight: number;
    onboardedAt: string | null;
    // Bought expansion regions; "home" is always open.
    unlockedRegions: string[];
    // Paid Legend/region bounty ids (lib/legends.ts).
    claimedRewards: string[];
    // Star Chart beta only (null when the flag is off or never named).
    shipName: string | null;
    charted: ChartedStarRef[];
};

export type ChartStarResult =
    | {
        ok: true;
        starlight: number;
        lifetimeStarlight: number;
        charted: ChartedStarRef[];
        completedConstellation: boolean;
        // Bounties this chart finished (usually none).
        claimed: Reward[];
        claimedRewards: string[];
    }
    | { ok: false; error: string };

export type ClaimRewardsResult =
    | { ok: true; starlight: number; lifetimeStarlight: number; claimed: Reward[]; claimedRewards: string[] }
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
            unlockedRegions: Array.isArray(data.unlockedRegions) ? data.unlockedRegions : [],
            claimedRewards: Array.isArray(data.claimedRewards) ? data.claimedRewards : [],
            shipName: typeof data.shipName === "string" ? data.shipName : null,
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
            claimed: Array.isArray(data.claimed) ? data.claimed : [],
            claimedRewards: Array.isArray(data.claimedRewards) ? data.claimedRewards : [],
        };
    } catch {
        return { ok: false, error: "Couldn't reach the star chart. Check your connection and try again." };
    }
}

export type UnlockRegionResult =
    | { ok: true; starlight: number; lifetimeStarlight: number; unlockedRegions: string[] }
    | { ok: false; error: string };

export async function unlockRegion(regionId: string): Promise<UnlockRegionResult> {
    try {
        const response = await fetch("/api/star-chart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "unlock-region", regionId }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            return { ok: false, error: typeof data.error === "string" ? data.error : "Couldn't open that part of the sky." };
        }

        return {
            ok: true,
            starlight: data.starlight,
            lifetimeStarlight: data.lifetimeStarlight,
            unlockedRegions: data.unlockedRegions,
        };
    } catch {
        return { ok: false, error: "Couldn't reach the star chart. Check your connection and try again." };
    }
}

export async function claimRewards(): Promise<ClaimRewardsResult> {
    try {
        const response = await fetch("/api/star-chart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "claim" }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            return { ok: false, error: typeof data.error === "string" ? data.error : "Couldn't collect that reward." };
        }

        return {
            ok: true,
            starlight: data.starlight,
            lifetimeStarlight: data.lifetimeStarlight,
            claimed: Array.isArray(data.claimed) ? data.claimed : [],
            claimedRewards: Array.isArray(data.claimedRewards) ? data.claimedRewards : [],
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
