export type GamificationState = {
    totalXp: number;
    awardedTaskIds: string[];
};

export type XpAward = {
    xp: number;
    source: "ollama" | "fallback";
};
