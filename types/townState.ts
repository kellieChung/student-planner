export type TownState = {
    currency: number;
    libraryGrowth: number;
    workshopGrowth: number;
    trainingGroundsGrowth: number;
    watchtowerGrowth: number;
    townSquareGrowth: number;
    kingdomStage: KingdomStage;
    onboardingCompletedAt: string | null;
};

export type BuildingKey =
    | "library"
    | "workshop"
    | "trainingGrounds"
    | "watchtower"
    | "townSquare";

export type KingdomStage = "village" | "town" | "city" | "kingdom";

export type GrowthAward = {
    building: BuildingKey;
    amount: number;
    currency: number;
};

export type MascotTrigger = "taskStart" | "taskComplete" | "announcementFound";
