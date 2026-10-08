import { NextResponse } from "next/server";
import { auth, sessionUserRef } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import {
    ChartedStarRef,
    getConstellation,
    getSkyRegion,
    isComplete,
    isVisible,
    meetsRegionPrerequisites,
    starPrice,
} from "@/lib/constellations";
import { claimableRewards, type Reward } from "@/lib/legends";
import { countQueries } from "@/lib/queryCount";
import { starChartBetaEnabled } from "@/lib/featureFlags";

class ChartError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

async function getUser() {
    const session = await auth();

    if (!session?.user?.email) return null;

    return sessionUserRef(session);
}

// Read first: an upsert is a billed write on every planner load/refocus,
// and the row almost always exists already.
async function getOrCreateChart(userId: string) {
    const existing = await prisma.starChart.findUnique({ where: { userId } });
    if (existing) return existing;

    return prisma.starChart.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });
}

type ChartedRow = { constellationId: string; starIndex: number; chartedAt: Date };

function toChartedRef(row: ChartedRow): ChartedStarRef {
    return { ...row, chartedAt: row.chartedAt.toISOString() };
}

async function loadChartedStars(userId: string, client: Prisma.TransactionClient = prisma): Promise<ChartedStarRef[]> {
    const rows = await client.chartedStar.findMany({
        where: { userId },
        select: { constellationId: true, starIndex: true, chartedAt: true },
        orderBy: { chartedAt: "asc" },
    });
    return rows.map(toChartedRef);
}

type ChartBalances = { starlight: number; lifetimeStarlight: number; claimedRewards: string[] };

// Pays every finished, unpaid Legend/region bounty in two statements: the
// `NOT hasSome` guard, increments and push are one update (a concurrent
// request that already paid them makes it match nothing), then one
// createMany for the ledger. Returns the new balances when it paid.
async function payRewards(
    tx: Prisma.TransactionClient,
    userId: string,
    charted: ChartedStarRef[],
    claimed: string[]
): Promise<{ rewards: Reward[]; balances: ChartBalances | null }> {
    const rewards = claimableRewards(charted, claimed);
    if (rewards.length === 0) return { rewards: [], balances: null };

    const ids = rewards.map((reward) => reward.id);
    const total = rewards.reduce((sum, reward) => sum + reward.bounty, 0);
    const [paid] = await tx.starChart.updateManyAndReturn({
        where: { userId, NOT: { claimedRewards: { hasSome: ids } } },
        data: {
            starlight: { increment: total },
            lifetimeStarlight: { increment: total },
            claimedRewards: { push: ids },
        },
        select: { starlight: true, lifetimeStarlight: true, claimedRewards: true },
    });

    if (!paid) return { rewards: [], balances: null };

    await tx.starlightLedger.createMany({
        data: rewards.map((reward) => ({ userId, delta: reward.bounty, reason: reward.id })),
    });

    return { rewards, balances: paid };
}

export const GET = countQueries("GET /api/star-chart", async function GET() {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        const [chart, charted] = await Promise.all([getOrCreateChart(user.id), loadChartedStars(user.id)]);

        return NextResponse.json({
            success: true,
            starlight: chart.starlight,
            lifetimeStarlight: chart.lifetimeStarlight,
            onboardedAt: chart.onboardedAt?.toISOString() ?? null,
            unlockedRegions: chart.unlockedRegions,
            claimedRewards: chart.claimedRewards,
            shipName: starChartBetaEnabled() ? chart.shipName : null,
            charted,
        });
    } catch (error) {
        console.error("Failed to load star chart:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
});

export const POST = countQueries("POST /api/star-chart", async function POST(request: Request) {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        let body: Record<string, unknown>;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
        }

        if (body.action === "chart") {
            const constellation = typeof body.constellationId === "string" ? getConstellation(body.constellationId) : undefined;
            const starIndex = body.starIndex;

            if (!constellation) {
                return NextResponse.json({ success: false, error: "Unknown constellation." }, { status: 400 });
            }

            if (typeof starIndex !== "number" || !Number.isInteger(starIndex) || starIndex < 0 || starIndex >= constellation.stars.length) {
                return NextResponse.json({ success: false, error: "Unknown star." }, { status: 400 });
            }

            const price = starPrice(constellation, starIndex);

            const result = await prisma.$transaction(async (tx) => {
                const chart = await tx.starChart.upsert({
                    where: { userId: user.id },
                    create: { userId: user.id },
                    update: {},
                });

                // All of them, once: visibility in progress regions, the
                // duplicate check and the reward check all read from it.
                const chartedSoFar = await loadChartedStars(user.id, tx);

                if (!isVisible(constellation, chart.lifetimeStarlight, chartedSoFar, chart.unlockedRegions)) {
                    throw new ChartError(`${constellation.name} hasn't appeared in your sky yet.`, 403);
                }

                if (chartedSoFar.some((star) => star.constellationId === constellation.id && star.starIndex === starIndex)) {
                    throw new ChartError("You've already charted this star.", 409);
                }

                // Conditional decrement: the balance check and the charge are
                // one statement, so two quick clicks can't both spend it.
                const [charged] = await tx.starChart.updateManyAndReturn({
                    where: { userId: user.id, starlight: { gte: price } },
                    data: { starlight: { decrement: price } },
                    select: { starlight: true, lifetimeStarlight: true, claimedRewards: true },
                });

                if (!charged) {
                    throw new ChartError("Not enough Starlight to chart this star yet.", 402);
                }

                const created = await tx.chartedStar.create({
                    data: { userId: user.id, constellationId: constellation.id, starIndex },
                    select: { constellationId: true, starIndex: true, chartedAt: true },
                });
                const charted = [...chartedSoFar, toChartedRef(created)];
                const { rewards, balances } = await payRewards(tx, user.id, charted, charged.claimedRewards);

                return { balances: balances ?? charged, charted, rewards };
            });

            return NextResponse.json({
                success: true,
                starlight: result.balances.starlight,
                lifetimeStarlight: result.balances.lifetimeStarlight,
                charted: result.charted,
                completedConstellation: isComplete(constellation, result.charted),
                claimed: result.rewards,
                claimedRewards: result.balances.claimedRewards,
            });
        }

        // Pays rewards finished without a new chart (e.g. before Legends
        // shipped). The client only calls this when it sees one is due.
        if (body.action === "claim") {
            const result = await prisma.$transaction(async (tx) => {
                const [chart, charted] = await Promise.all([
                    tx.starChart.findUnique({ where: { userId: user.id } }),
                    loadChartedStars(user.id, tx),
                ]);

                if (!chart) throw new ChartError("Nothing to claim yet.", 404);

                const { rewards, balances } = await payRewards(tx, user.id, charted, chart.claimedRewards);

                return { balances: balances ?? chart, rewards };
            });

            return NextResponse.json({
                success: true,
                starlight: result.balances.starlight,
                lifetimeStarlight: result.balances.lifetimeStarlight,
                claimed: result.rewards,
                claimedRewards: result.balances.claimedRewards,
            });
        }

        if (body.action === "unlock-region") {
            const region = typeof body.regionId === "string" ? getSkyRegion(body.regionId) : undefined;

            if (!region || region.price === 0) {
                return NextResponse.json({ success: false, error: "Unknown region." }, { status: 400 });
            }

            const chart = await prisma.$transaction(async (tx) => {
                const current = await tx.starChart.upsert({
                    where: { userId: user.id },
                    create: { userId: user.id },
                    update: {},
                });

                if (current.unlockedRegions.includes(region.id)) {
                    throw new ChartError(`You've already charted a course to ${region.name}.`, 409);
                }

                if (current.lifetimeStarlight < region.requiresLifetime || !meetsRegionPrerequisites(region, current.unlockedRegions)) {
                    throw new ChartError(`${region.name} isn't within reach yet.`, 403);
                }

                // Balance check, ownership check and charge in one statement,
                // so a double click can't buy it twice.
                const [bought] = await tx.starChart.updateManyAndReturn({
                    where: { userId: user.id, starlight: { gte: region.price }, NOT: { unlockedRegions: { has: region.id } } },
                    data: { starlight: { decrement: region.price }, unlockedRegions: { push: region.id } },
                    select: { starlight: true, lifetimeStarlight: true, unlockedRegions: true },
                });

                if (!bought) {
                    throw new ChartError(`Not enough Starlight to reach ${region.name} yet.`, 402);
                }

                await tx.starlightLedger.create({
                    data: { userId: user.id, delta: -region.price, reason: `region-unlock:${region.id}` },
                });

                return bought;
            });

            return NextResponse.json({
                success: true,
                starlight: chart.starlight,
                lifetimeStarlight: chart.lifetimeStarlight,
                unlockedRegions: chart.unlockedRegions,
            });
        }

        return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
    } catch (error) {
        if (error instanceof ChartError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }

        // Two simultaneous charts of the same star: the unique constraint
        // rejects the second and its transaction (including the charge) rolls back.
        if ((error as { code?: string }).code === "P2002") {
            return NextResponse.json({ success: false, error: "You've already charted this star." }, { status: 409 });
        }

        console.error("Failed to update star chart:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
});

export async function PATCH(request: Request) {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        let body: Record<string, unknown>;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
        }

        if (!("onboardedAt" in body) || !(body.onboardedAt === null || typeof body.onboardedAt === "string")) {
            return NextResponse.json({ success: false, error: "'onboardedAt' must be a string or null." }, { status: 400 });
        }

        const onboardedAt = typeof body.onboardedAt === "string" ? new Date(body.onboardedAt) : null;

        if (onboardedAt && !Number.isFinite(onboardedAt.getTime())) {
            return NextResponse.json({ success: false, error: "'onboardedAt' must be a valid date." }, { status: 400 });
        }

        const chart = await prisma.starChart.upsert({
            where: { userId: user.id },
            create: { userId: user.id, onboardedAt },
            update: { onboardedAt },
        });

        return NextResponse.json({ success: true, onboardedAt: chart.onboardedAt?.toISOString() ?? null });
    } catch (error) {
        console.error("Failed to save onboarding:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}
