import { KingdomStage, TownState } from "@/types/townState";

const KINGDOM_STAGES: KingdomStage[] = ["village", "town", "city", "kingdom"];

const defaultState: TownState = {
    currency: 0,
    libraryGrowth: 0,
    workshopGrowth: 0,
    trainingGroundsGrowth: 0,
    watchtowerGrowth: 0,
    townSquareGrowth: 0,
    kingdomStage: "village",
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
        kingdomStage: KINGDOM_STAGES.includes(data.kingdomStage as KingdomStage) ? (data.kingdomStage as KingdomStage) : "village",
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

// The PATCH route treats an absent key as "leave this field alone," so
// every save helper below sends only the fields it actually owns — two
// independent writers (a task completion vs. finishing onboarding) can
// then never clobber each other's fields with a stale full-row copy. There
// is deliberately no general "send the whole TownState" helper; each real
// writer below is scoped to what it's actually responsible for.

// WeeklyPlannerView's own townState copy is fetched once on mount and can
// easily be stale by the time a completion fires (e.g. mounted before
// LaptopFrame's onboarding tour finishes) — omitting onboardingCompletedAt
// here means that staleness can never roll back the real timestamp
// completeOnboarding below just set.
export async function saveTownGrowth(state: TownState): Promise<void> {
    const growthFields = {
        currency: state.currency,
        libraryGrowth: state.libraryGrowth,
        workshopGrowth: state.workshopGrowth,
        trainingGroundsGrowth: state.trainingGroundsGrowth,
        watchtowerGrowth: state.watchtowerGrowth,
        townSquareGrowth: state.townSquareGrowth,
        kingdomStage: state.kingdomStage,
    };

    try {
        await fetch("/api/town-state", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(growthFields),
        });
    } catch (error) {
        console.error("Could not save town growth", error);
    }
}

// LaptopFrame's own worldTownState copy is only refreshed when the user
// actually visits World, so on a genuine first run it can still hold the
// page-load snapshot (all zeros) if a task is completed while the
// onboarding tour is still showing (the tour is dismissible, not a modal —
// the OS underneath is real and clickable). Sending only the timestamp
// here means finishing onboarding can never roll back currency/growth a
// completion already awarded.
export async function saveOnboardingCompletion(completedAt: string): Promise<void> {
    try {
        await fetch("/api/town-state", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ onboardingCompletedAt: completedAt }),
        });
    } catch (error) {
        console.error("Could not save onboarding completion", error);
    }
}
