import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getConstellation, isComplete, isUnlocked, starPrice } from "@/lib/constellations";

const MAX_EARN_PER_TASK = 200;

class ChartError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

async function getUser() {
    const session = await auth();

    if (!session?.user?.email) return null;

    return prisma.user.findUnique({ where: { email: session.user.email } });
}

async function getOrCreateChart(userId: string) {
    return prisma.starChart.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });
}

async function loadChartedStars(userId: string) {
    return prisma.chartedStar.findMany({
        where: { userId },
        select: { constellationId: true, starIndex: true },
        orderBy: { chartedAt: "asc" },
    });
}

export async function GET() {
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
            charted,
        });
    } catch (error) {
        console.error("❌ Failed to load star chart:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}

export async function POST(request: Request) {
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

        if (body.action === "earn") {
            const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? Math.round(body.amount) : NaN;

            if (!(amount >= 0 && amount <= MAX_EARN_PER_TASK)) {
                return NextResponse.json(
                    { success: false, error: `'amount' must be a number between 0 and ${MAX_EARN_PER_TASK}.` },
                    { status: 400 }
                );
            }

            // Increment server-side (never "set to the client's total") so a
            // stale client copy can't undo a purchase made in another view.
            const chart = await prisma.starChart.upsert({
                where: { userId: user.id },
                create: { userId: user.id, starlight: amount, lifetimeStarlight: amount },
                update: { starlight: { increment: amount }, lifetimeStarlight: { increment: amount } },
            });

            return NextResponse.json({
                success: true,
                starlight: chart.starlight,
                lifetimeStarlight: chart.lifetimeStarlight,
            });
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

            const price = starPrice(constellation);

            const result = await prisma.$transaction(async (tx) => {
                const chart = await tx.starChart.upsert({
                    where: { userId: user.id },
                    create: { userId: user.id },
                    update: {},
                });

                if (!isUnlocked(constellation, chart.lifetimeStarlight)) {
                    throw new ChartError(`${constellation.name} hasn't appeared in your sky yet.`, 403);
                }

                const existing = await tx.chartedStar.findUnique({
                    where: {
                        userId_constellationId_starIndex: { userId: user.id, constellationId: constellation.id, starIndex },
                    },
                });

                if (existing) {
                    throw new ChartError("You've already charted this star.", 409);
                }

                // Conditional decrement: the balance check and the charge are
                // one statement, so two quick clicks can't both spend it.
                const charged = await tx.starChart.updateMany({
                    where: { userId: user.id, starlight: { gte: price } },
                    data: { starlight: { decrement: price } },
                });

                if (charged.count === 0) {
                    throw new ChartError("Not enough Starlight to chart this star yet.", 402);
                }

                await tx.chartedStar.create({
                    data: { userId: user.id, constellationId: constellation.id, starIndex },
                });

                const [updatedChart, charted] = await Promise.all([
                    tx.starChart.findUniqueOrThrow({ where: { userId: user.id } }),
                    tx.chartedStar.findMany({
                        where: { userId: user.id },
                        select: { constellationId: true, starIndex: true },
                        orderBy: { chartedAt: "asc" },
                    }),
                ]);

                return { chart: updatedChart, charted };
            });

            return NextResponse.json({
                success: true,
                starlight: result.chart.starlight,
                lifetimeStarlight: result.chart.lifetimeStarlight,
                charted: result.charted,
                completedConstellation: isComplete(constellation, result.charted),
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

        console.error("❌ Failed to update star chart:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}

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
        console.error("❌ Failed to save onboarding:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}
