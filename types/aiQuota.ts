// A user's announcement-analysis allowance (lib/aiRateLimit.ts). `remaining`
// is what they can still run right now: weekly checks left plus any bonus
// credits granted from the dev dashboard.
export type DetectionQuota = {
    limit: number;
    used: number;
    weeklyRemaining: number;
    credits: number;
    remaining: number;
    // When the oldest weekly check in the window expires and frees a slot;
    // null when none are in use.
    resetsAt: string | null;
};
