import { GamificationState } from "@/types/gamification";

const STORAGE_KEY = "gamification_state";

const defaultState: GamificationState = {
    totalXp: 0,
    awardedTaskIds: [],
};

export function getGamificationState(): GamificationState {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) return defaultState;

    try {
        const parsed = JSON.parse(stored) as Partial<GamificationState>;

        return {
            totalXp: typeof parsed.totalXp === "number" ? parsed.totalXp : 0,
            awardedTaskIds: Array.isArray(parsed.awardedTaskIds) ? parsed.awardedTaskIds : [],
        };
    } catch {
        return defaultState;
    }
}

export function saveGamificationState(state: GamificationState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
