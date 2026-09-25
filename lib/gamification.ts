import { GamificationState } from "@/types/gamification";

const defaultState: GamificationState = {
    totalXp: 0,
    awardedTaskIds: [],
};

// null means "couldn't load", distinct from a real empty state.
export async function getGamificationState(): Promise<GamificationState | null> {
    try {
        const response = await fetch("/api/gamification");

        if (!response.ok) return null;

        const data = await response.json() as Partial<GamificationState>;

        return {
            totalXp: typeof data.totalXp === "number" ? data.totalXp : defaultState.totalXp,
            awardedTaskIds: Array.isArray(data.awardedTaskIds) ? data.awardedTaskIds : defaultState.awardedTaskIds,
        };
    } catch {
        return null;
    }
}

export type XpAwardResult = {
    awarded: boolean;
    xp: number;
    totalXp: number;
    starlight: number;
    lifetimeStarlight: number;
};

// The server computes the amount, dedups per task and increments XP and
// Starlight together (app/api/gamification/route.ts).
export async function awardTaskXp(input: {
    taskId: string;
    due: string | null;
    completedAt: string;
    estimatedMinutes?: number;
}): Promise<XpAwardResult | null> {
    try {
        const response = await fetch("/api/gamification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "award", ...input }),
        });

        if (!response.ok) return null;

        return await response.json() as XpAwardResult;
    } catch (error) {
        console.error("Could not award XP", error);
        return null;
    }
}

// Dev dashboard only (the route rejects non-dev accounts).
export async function saveGamificationState(state: GamificationState): Promise<void> {
    try {
        await fetch("/api/gamification", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state),
        });
    } catch (error) {
        console.error("Could not save gamification state", error);
    }
}
