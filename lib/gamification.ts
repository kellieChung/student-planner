import { GamificationState } from "@/types/gamification";

const defaultState: GamificationState = {
    totalXp: 0,
    awardedTaskIds: [],
};

export async function getGamificationState(): Promise<GamificationState> {
    try {
        const response = await fetch("/api/gamification");

        if (!response.ok) return defaultState;

        const data = await response.json() as Partial<GamificationState>;

        return {
            totalXp: typeof data.totalXp === "number" ? data.totalXp : 0,
            awardedTaskIds: Array.isArray(data.awardedTaskIds) ? data.awardedTaskIds : [],
        };
    } catch {
        return defaultState;
    }
}

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
