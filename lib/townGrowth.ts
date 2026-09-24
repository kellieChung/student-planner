// RETIRED (2026-09-24): the medieval town/mascot layer is no longer used by the
// live app — Lodestar's Star Chart replaced it (gamificationSystem.md). Kept
// deliberately so it can be restored; not deleted.
import { LabelType } from "@/lib/taskLabel";
import { BuildingKey, GrowthAward, KingdomStage, TownState } from "@/types/townState";

export const BUILDING_KEYS: BuildingKey[] = [
    "library",
    "workshop",
    "trainingGrounds",
    "watchtower",
    "townSquare",
];

// Each building has 3 visual stages (empty plot -> basic -> upgraded).
// Thresholds scale up per stage so a building doesn't max out after a
// handful of completions.
export const BUILDING_STAGE_THRESHOLDS = [0, 60, 200];

// Kingdom-wide stage, driven by the sum of every building's growth.
// Thresholds scale steeply per stage, per gamificationSystem.md, so an
// active user's semester roughly maps onto reaching "kingdom."
export const STAGE_THRESHOLDS: Record<KingdomStage, number> = {
    village: 0,
    town: 250,
    city: 750,
    kingdom: 1800,
};

const STAGE_ORDER: KingdomStage[] = ["village", "town", "city", "kingdom"];

// TODO tasks (custom, non-Canvas courses) have no natural typed building —
// they fold into Town Square, which already doubles as the general-activity
// anchor for overall stage progression.
export function mapTypeCodeToBuilding(typeCode: LabelType): BuildingKey {
    if (typeCode === "HW") return "workshop";
    if (typeCode === "R") return "library";
    if (typeCode === "EXAM") return "trainingGrounds";
    return "townSquare";
}

const GROWTH_FIELD_BY_BUILDING: Record<BuildingKey, keyof TownState> = {
    library: "libraryGrowth",
    workshop: "workshopGrowth",
    trainingGrounds: "trainingGroundsGrowth",
    watchtower: "watchtowerGrowth",
    townSquare: "townSquareGrowth",
};

export function growthFieldForBuilding(building: BuildingKey): keyof TownState {
    return GROWTH_FIELD_BY_BUILDING[building];
}

// General day-to-day activity feeds Town Square a small flat amount on
// every completion, on top of whichever typed building the task itself
// grows (gamificationSystem.md: Town Square tracks "how" as well as being
// the stage anchor).
const TOWN_SQUARE_ACTIVITY_BONUS = 3;

// Currency is a single reward economy tied to real productive behavior —
// deliberately reuses the same deterministic XP amount task-xp already
// computed, rather than inventing a second scoring formula.
export function computeGrowthAward(typeCode: LabelType, xpAmount: number): GrowthAward {
    const building = mapTypeCodeToBuilding(typeCode);

    return { building, amount: xpAmount, currency: xpAmount };
}

export function applyGrowthAward(state: TownState, award: GrowthAward): TownState {
    const field = growthFieldForBuilding(award.building);
    const next: TownState = {
        ...state,
        currency: state.currency + award.currency,
        [field]: (state[field] as number) + award.amount,
    };

    if (award.building !== "townSquare") {
        next.townSquareGrowth = state.townSquareGrowth + TOWN_SQUARE_ACTIVITY_BONUS;
    }

    return next;
}

export function computeBuildingStage(growth: number): number {
    let stage = 0;

    for (let i = 0; i < BUILDING_STAGE_THRESHOLDS.length; i++) {
        if (growth >= BUILDING_STAGE_THRESHOLDS[i]) stage = i;
    }

    return stage;
}

export function totalTownGrowth(state: TownState): number {
    return (
        state.libraryGrowth +
        state.workshopGrowth +
        state.trainingGroundsGrowth +
        state.watchtowerGrowth +
        state.townSquareGrowth
    );
}

export function computeKingdomStage(state: TownState): KingdomStage {
    const total = totalTownGrowth(state);
    let stage: KingdomStage = "village";

    for (const candidate of STAGE_ORDER) {
        if (total >= STAGE_THRESHOLDS[candidate]) stage = candidate;
    }

    return stage;
}

export function nextKingdomStage(stage: KingdomStage): KingdomStage | null {
    const index = STAGE_ORDER.indexOf(stage);
    return index >= 0 && index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null;
}

// Completed on/before its due date, using the same plain "YYYY-MM-DD"
// comparison convention Assignment.due already uses elsewhere (no
// server-side timezone guessing).
export function isCompletionOnTime(due: string, completedDay: string): boolean {
    return completedDay <= due;
}

const WATCHTOWER_ON_TIME_BONUS = 5;

// Watchtower's trigger, deliberately not a streak: a flat bonus on every
// on-time completion, no consecutive-day tracking, no reset, no grace
// tokens. The previous streak-based version (updateStreak/
// applyDailyCompletion, removed) was found to run against
// gamificationSystem.md's own "avoid punishing mechanics" principle even
// with grace tokens — any day-to-day consistency requirement still creates
// pressure. A single late task now simply doesn't add anything; it can't
// undo anything either.
export function applyWatchtowerBonus(state: TownState, completedOnTime: boolean): TownState {
    if (!completedOnTime) return state;

    return { ...state, watchtowerGrowth: state.watchtowerGrowth + WATCHTOWER_ON_TIME_BONUS };
}

const MILESTONE_CHECK_INTERVAL = 5;

// The overall Village/Town/City/Kingdom stage is deliberately NOT derived
// live from totalTownGrowth on every render — per-task growth should feel
// continuous (each building updates immediately), but the big skyline-wide
// jump is gated behind a checkpoint so it reads as earned rather than an
// automatic side effect of any one task. Checkpoint = every Nth completed
// task (completionCount is the caller's post-award GamificationState.
// awardedTaskIds.length — no separate counter needed). computeKingdomStage
// still does the actual threshold math; this just decides *when* the
// persisted TownState.kingdomStage is allowed to catch up to it, and only
// forward — a checkpoint after several quiet weeks can jump more than one
// stage at once, but kingdomStage never regresses.
export function maybeAdvanceKingdomStage(state: TownState, completionCount: number): TownState {
    if (completionCount % MILESTONE_CHECK_INTERVAL !== 0) return state;

    const eligible = computeKingdomStage(state);
    const eligibleIndex = STAGE_ORDER.indexOf(eligible);
    const currentIndex = STAGE_ORDER.indexOf(state.kingdomStage);

    return eligibleIndex > currentIndex ? { ...state, kingdomStage: eligible } : state;
}
