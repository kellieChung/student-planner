import { TownState } from "@/types/townState";

const defaultState: TownState = {
    currency: 0,
    libraryGrowth: 0,
    workshopGrowth: 0,
    trainingGroundsGrowth: 0,
    watchtowerGrowth: 0,
    townSquareGrowth: 0,
    currentStreak: 0,
    longestStreak: 0,
    graceTokens: 2,
    lastGoodDay: null,
    onboardingCompletedAt: null,
};

function coerceState(data: Partial<TownState>): TownState {
    return {
        currency: typeof data.currency === "number" ? data.currency : 0,
        libraryGrowth: typeof data.libraryGrowth === "number" ? data.libraryGrowth : 0,
        workshopGrowth: typeof data.workshopGrowth === "number" ? data.workshopGrowth : 0,
        trainingGroundsGrowth: typeof data.trainingGroundsGrowth === "number" ? data.trainingGroundsGrowth : 0,
        watchtowerGrowth: typeof data.watchtowerGrowth === "number" ? data.watchtowerGrowth : 0,
        townSquareGrowth: typeof data.townSquareGrowth === "number" ? data.townSquareGrowth : 0,
        currentStreak: typeof data.currentStreak === "number" ? data.currentStreak : 0,
        longestStreak: typeof data.longestStreak === "number" ? data.longestStreak : 0,
        graceTokens: typeof data.graceTokens === "number" ? data.graceTokens : 2,
        lastGoodDay: typeof data.lastGoodDay === "string" ? data.lastGoodDay : null,
        onboardingCompletedAt: typeof data.onboardingCompletedAt === "string" ? data.onboardingCompletedAt : null,
    };
}

export async function getTownState(): Promise<TownState> {
    try {
        const response = await fetch("/api/town-state");

        if (!response.ok) return defaultState;

        const data = await response.json() as Partial<TownState>;
        return coerceState(data);
    } catch {
        return defaultState;
    }
}

export async function saveTownState(state: TownState): Promise<void> {
    try {
        await fetch("/api/town-state", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state),
        });
    } catch (error) {
        console.error("Could not save town state", error);
    }
}
