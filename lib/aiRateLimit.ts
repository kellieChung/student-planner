import { prisma } from "@/lib/prisma";
import { isDevAccountEmail } from "@/lib/devAccounts";

const WEEKLY_LIMIT = 2;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type DetectionPassRateLimit = {
    allowed: boolean;
    remaining: number;
    resetsAt: string | null;
};

// Caps the manual "Check for new announcements" trigger
// (app/api/ai/analyze-announcements/route.ts) at WEEKLY_LIMIT real runs
// per rolling 7 days — cost control on the Anthropic/Ollama extraction
// call, not a correctness concern. Dev accounts (DEV_ACCOUNT_EMAILS) skip
// this entirely. Counts AiTaskEvent rows rather than a separate counter
// table so the same log that feeds the accuracy-tracking work also drives
// the limit, with no risk of the two drifting out of sync.
export async function checkDetectionPassRateLimit(
    userId: string,
    email: string | null | undefined
): Promise<DetectionPassRateLimit> {
    if (isDevAccountEmail(email)) {
        return { allowed: true, remaining: Infinity, resetsAt: null };
    }

    const windowStart = new Date(Date.now() - WINDOW_MS);

    const recentRuns = await prisma.aiTaskEvent.findMany({
        where: {
            userId,
            type: "detection_pass_triggered",
            createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
    });

    const allowed = recentRuns.length < WEEKLY_LIMIT;
    const resetsAt =
        recentRuns.length > 0
            ? new Date(recentRuns[0].createdAt.getTime() + WINDOW_MS).toISOString()
            : null;

    return {
        allowed,
        remaining: Math.max(0, WEEKLY_LIMIT - recentRuns.length),
        resetsAt,
    };
}
