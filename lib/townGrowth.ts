import { LabelType } from "@/lib/taskLabel";
import { daysBetween, parseLocalDate } from "@/lib/utils";
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

// "On-time" for the streak: completed on/before its due date, using the
// same plain "YYYY-MM-DD" comparison convention Assignment.due already
// uses elsewhere (no server-side timezone guessing).
export function isCompletionOnTime(due: string, completedDay: string): boolean {
    return completedDay <= due;
}

const GRACE_TOKEN_MAX_GAP_DAYS = 1;

// Extends the Watchtower streak on a consecutive good day (a day with at
// least one on-time completion), spends one grace token to bridge exactly
// one missed day if available, otherwise resets. Per gamificationSystem.md's
// "avoid punishing streak mechanics" — a late completion simply doesn't
// extend the streak, it doesn't break it either; only a fully missed day
// (checked once, the next time a good day happens) risks breaking it.
export function updateStreak(
    state: Pick<TownState, "currentStreak" | "longestStreak" | "graceTokens" | "lastGoodDay">,
    completedOnTime: boolean,
    todayStr: string
): Pick<TownState, "currentStreak" | "longestStreak" | "graceTokens" | "lastGoodDay"> {
    if (!completedOnTime) return state;
    if (state.lastGoodDay === todayStr) return state;

    const gapDays = state.lastGoodDay
        ? daysBetween(parseLocalDate(todayStr), parseLocalDate(state.lastGoodDay))
        : null;

    let currentStreak: number;
    let graceTokens = state.graceTokens;

    if (gapDays === null || gapDays <= 1) {
        currentStreak = state.currentStreak + 1;
    } else if (gapDays - 1 <= GRACE_TOKEN_MAX_GAP_DAYS && graceTokens > 0) {
        graceTokens -= 1;
        currentStreak = state.currentStreak + 1;
    } else {
        currentStreak = 1;
    }

    return {
        currentStreak,
        longestStreak: Math.max(state.longestStreak, currentStreak),
        graceTokens,
        lastGoodDay: todayStr,
    };
}

const WATCHTOWER_GROWTH_PER_STREAK_DAY = 5;

// Composes updateStreak with the Watchtower's own growth counter — its
// height/detail grows with consistency, so it only advances on a genuine
// streak extension (including a grace-token save), not on a same-day repeat
// or an unextended streak.
export function applyDailyCompletion(state: TownState, completedOnTime: boolean, todayStr: string): TownState {
    const streakFields = updateStreak(state, completedOnTime, todayStr);

    if (streakFields.currentStreak <= state.currentStreak) {
        return { ...state, ...streakFields };
    }

    return {
        ...state,
        ...streakFields,
        watchtowerGrowth: state.watchtowerGrowth + WATCHTOWER_GROWTH_PER_STREAK_DAY,
    };
}
