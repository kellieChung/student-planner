import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { logAiTaskEvent } from "@/lib/aiTaskEvents";
import { DetectionQuota } from "@/types/aiQuota";

export const WEEKLY_LIMIT = 2;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// How long after a run starts that a paused run can still be resumed
// without being charged a second time.
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export type DetectionCheckCharge = "weekly" | "credit" | "resume";

// Caps the manual "Check for new announcements" trigger
// (app/api/ai/analyze-announcements/route.ts) at WEEKLY_LIMIT real runs
// per rolling 7 days — cost control on the Anthropic/Ollama extraction
// call, not a correctness concern. There is deliberately no dev-account
// bypass: a dev account that showed "unlimited" could never exercise the
// counter, the out-of-checks state or a credit being spent. Extra runs
// come from credits granted on the dev dashboard instead.
//
// Everything is counted from AiTaskEvent rows rather than a counter table
// so the log that feeds the accuracy-tracking work also drives the limit,
// with no risk of the two drifting apart. A credit-paid run is tagged
// `paidWithCredit` and excluded from the weekly count, otherwise it would
// also hold a weekly slot after the credit was already spent on it.
function amountOf(data: Prisma.JsonValue): number {
    const amount = (data as { amount?: unknown } | null)?.amount;

    return typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
}

async function countCredits(userId: string): Promise<number> {
    const [grants, spent] = await Promise.all([
        prisma.aiTaskEvent.findMany({
            where: { userId, type: "detection_credit_granted" },
            select: { data: true },
        }),
        prisma.aiTaskEvent.count({
            where: {
                userId,
                type: "detection_pass_triggered",
                data: { path: ["paidWithCredit"], equals: true },
            },
        }),
    ]);

    const granted = grants.reduce((sum, grant) => sum + amountOf(grant.data), 0);

    return Math.max(0, granted - spent);
}

export async function getDetectionQuota(userId: string): Promise<DetectionQuota> {
    const windowStart = new Date(Date.now() - WINDOW_MS);

    const [recentRuns, credits] = await Promise.all([
        prisma.aiTaskEvent.findMany({
            where: {
                userId,
                type: "detection_pass_triggered",
                createdAt: { gte: windowStart },
            },
            orderBy: { createdAt: "asc" },
            select: { createdAt: true, data: true },
        }),
        countCredits(userId),
    ]);

    const weeklyRuns = recentRuns.filter(
        (run) => (run.data as { paidWithCredit?: unknown } | null)?.paidWithCredit !== true
    );

    const weeklyRemaining = Math.max(0, WEEKLY_LIMIT - weeklyRuns.length);

    return {
        limit: WEEKLY_LIMIT,
        used: Math.min(WEEKLY_LIMIT, weeklyRuns.length),
        weeklyRemaining,
        credits,
        remaining: weeklyRemaining + credits,
        resetsAt:
            weeklyRuns.length > 0
                ? new Date(weeklyRuns[0].createdAt.getTime() + WINDOW_MS).toISOString()
                : null,
    };
}

type ConsumeOptions = {
    runId?: string;
    resumeRunId?: string;
    data?: Prisma.InputJsonObject;
};

// A resume (after a pause or a dropped connection) is free, but only this
// many times per run — each one can re-bill announcements whose text changed.
const MAX_RESUMES_PER_RUN = 3;

// Spends one check for a real (non-dry-run) run: the weekly allowance
// first, a bonus credit only once that is used up. Logs the
// `detection_pass_triggered` event itself, so the charge and the record of
// it can't disagree. Resuming a charged run (same runId, within
// RESUME_WINDOW_MS, up to MAX_RESUMES_PER_RUN times) is free.
//
// Serialized per user with a transaction-scoped advisory lock: without it,
// several simultaneous requests all read the same "remaining" and all run.
export async function consumeDetectionCheck(
    userId: string,
    options: ConsumeOptions = {}
): Promise<{ allowed: boolean; charge: DetectionCheckCharge | null; quota: DetectionQuota }> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`detection:${userId}`}::text))`;

        if (options.resumeRunId) {
            const since = new Date(Date.now() - RESUME_WINDOW_MS);
            const [original, resumes] = await Promise.all([
                prisma.aiTaskEvent.findFirst({
                    where: {
                        userId,
                        type: "detection_pass_triggered",
                        createdAt: { gte: since },
                        data: { path: ["runId"], equals: options.resumeRunId },
                    },
                    select: { id: true },
                }),
                prisma.aiTaskEvent.count({
                    where: {
                        userId,
                        type: "detection_pass_resumed",
                        createdAt: { gte: since },
                        data: { path: ["runId"], equals: options.resumeRunId },
                    },
                }),
            ]);

            if (original && resumes < MAX_RESUMES_PER_RUN) {
                await logAiTaskEvent(userId, "detection_pass_resumed", {
                    data: { runId: options.resumeRunId },
                });

                return { allowed: true, charge: "resume" as const, quota: await getDetectionQuota(userId) };
            }
        }

        const before = await getDetectionQuota(userId);

        if (before.remaining <= 0) {
            return { allowed: false, charge: null, quota: before };
        }

        const charge: DetectionCheckCharge = before.weeklyRemaining > 0 ? "weekly" : "credit";

        await logAiTaskEvent(userId, "detection_pass_triggered", {
            data: {
                ...options.data,
                runId: options.runId ?? options.resumeRunId ?? null,
                ...(charge === "credit" ? { paidWithCredit: true } : {}),
            },
        });

        return { allowed: true, charge, quota: await getDetectionQuota(userId) };
    }, { timeout: 15_000 });
}

export async function grantDetectionCredits(
    userId: string,
    amount: number,
    grantedBy: string
): Promise<void> {
    await logAiTaskEvent(userId, "detection_credit_granted", {
        data: { amount, grantedBy },
    });
}

// Whether the user has asked this run to pause since `since` (the moment
// this request started, so a pause aimed at an earlier request can't stop a
// resumed one).
export async function isRunPaused(userId: string, runId: string, since: Date): Promise<boolean> {
    const pause = await prisma.aiTaskEvent.findFirst({
        where: {
            userId,
            type: "detection_pass_paused",
            createdAt: { gte: since },
            data: { path: ["runId"], equals: runId },
        },
        select: { id: true },
    });

    return pause !== null;
}

// Dev tool: forgets this week's weekly-allowance runs so the counter reads
// full again. Credit-paid runs are kept — deleting them would refund the
// credits, which the ledger above counts from these same rows.
export async function resetWeeklyDetectionUsage(userId: string): Promise<number> {
    const runs = await prisma.aiTaskEvent.findMany({
        where: {
            userId,
            type: "detection_pass_triggered",
            createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
        },
        select: { id: true, data: true },
    });

    const ids = runs
        .filter((run) => (run.data as { paidWithCredit?: unknown } | null)?.paidWithCredit !== true)
        .map((run) => run.id);

    await prisma.aiTaskEvent.deleteMany({ where: { id: { in: ids } } });

    return ids.length;
}

// The announcements a run was charged for, so resuming it can't reach past
// what the original check covered (see MAX_ANNOUNCEMENTS_PER_CHECK). Null
// when the run is unknown/expired or predates this being recorded.
export async function findRunAnnouncementIds(
    userId: string,
    runId: string
): Promise<string[] | null> {
    const run = await prisma.aiTaskEvent.findFirst({
        where: {
            userId,
            type: "detection_pass_triggered",
            createdAt: { gte: new Date(Date.now() - RESUME_WINDOW_MS) },
            data: { path: ["runId"], equals: runId },
        },
        select: { data: true },
    });

    const ids = (run?.data as { announcementIds?: unknown } | null)?.announcementIds;

    return Array.isArray(ids) && ids.every((id) => typeof id === "string")
        ? (ids as string[])
        : null;
}
