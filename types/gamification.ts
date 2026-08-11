export type GamificationState = {
    totalXp: number;
    awardedTaskIds: string[];
};

export type XpAward = {
    xp: number;
    reason: string;
    source: "ollama" | "fallback";
};
