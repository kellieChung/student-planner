import { NextResponse } from "next/server";
import { auth, sessionUserRef } from "@/auth";
import { prisma } from "@/lib/prisma";
import { starChartBetaEnabled } from "@/lib/featureFlags";
import { CONSTELLATIONS, isComplete } from "@/lib/constellations";
import {
    COSMETIC_CATALOG,
    DEFAULT_LOADOUT,
    isCosmeticSlot,
    normalizeShipName,
    SHIP_NAME_CHANGE_COST,
    type CosmeticItemView,
    type CosmeticSlot,
} from "@/lib/cosmetics";
import { countQueries } from "@/lib/queryCount";

class CosmeticError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

async function getUser() {
    const session = await auth();

    if (!session?.user?.email) return null;

    return sessionUserRef(session);
}

function notEnabled() {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
}

function isAvailable(item: { active: boolean; availableFrom: Date | null; availableUntil: Date | null }, now = new Date()): boolean {
    return item.active && (!item.availableFrom || item.availableFrom <= now) && (!item.availableUntil || item.availableUntil > now);
}

// Free defaults come from code, so the default look never depends on the
// seed having run.
const CODE_DEFAULTS: CosmeticItemView[] = COSMETIC_CATALOG.filter((item) => item.cost === 0).map((item) => ({
    ...item,
    minLifetime: null,
    minConstellations: null,
}));

// Catalog, owned items and loadout: three queries, fetched once per session
// by the Star Chart (components/starchart/CosmeticsContext.tsx).
export const GET = countQueries("GET /api/cosmetics", async function GET() {
    try {
        if (!starChartBetaEnabled()) return notEnabled();

        const user = await getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        const [items, owned, loadout] = await Promise.all([
            prisma.cosmeticItem.findMany({ orderBy: [{ slot: "asc" }, { sortOrder: "asc" }] }),
            prisma.userCosmetic.findMany({ where: { userId: user.id }, select: { itemId: true } }),
            prisma.cosmeticLoadout.findMany({ where: { userId: user.id }, select: { slot: true, itemId: true } }),
        ]);

        const ownedIds = new Set(owned.map((row) => row.itemId));
        const keyById = new Map(items.map((item) => [item.id, item.key]));
        // Shop shows what's on sale now, plus anything already owned.
        const shown = items.filter((item) => isAvailable(item) || ownedIds.has(item.id));
        const views: CosmeticItemView[] = shown.filter((item) => isCosmeticSlot(item.slot)).map((item) => ({
            key: item.key,
            slot: item.slot as CosmeticSlot,
            name: item.name,
            description: item.description,
            cost: item.cost,
            sortOrder: item.sortOrder,
            minLifetime: item.minLifetime,
            minConstellations: item.minConstellations,
        }));
        const viewKeys = new Set(views.map((item) => item.key));

        const equipped: Record<CosmeticSlot, string> = { ...DEFAULT_LOADOUT };
        for (const row of loadout) {
            const key = keyById.get(row.itemId);
            if (key && isCosmeticSlot(row.slot)) equipped[row.slot] = key;
        }

        return NextResponse.json({
            success: true,
            items: [...CODE_DEFAULTS.filter((item) => !viewKeys.has(item.key)), ...views],
            owned: owned.map((row) => keyById.get(row.itemId)).filter((key): key is string => Boolean(key)),
            loadout: equipped,
        });
    } catch (error) {
        console.error("Failed to load cosmetics:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
});

export async function POST(request: Request) {
    try {
        if (!starChartBetaEnabled()) return notEnabled();

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

        if (body.action === "buy") {
            return await buy(user.id, body.key);
        }

        if (body.action === "equip") {
            return await equip(user.id, body.key);
        }

        if (body.action === "ship-name") {
            return await renameShip(user.id, body.name);
        }

        return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
    } catch (error) {
        if (error instanceof CosmeticError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }

        console.error("Failed to update cosmetics:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}

// One transaction: availability, prerequisites, a conditional decrement
// (never below zero), the ownership row and the ledger row. The unique
// (userId, itemId) means a second concurrent buy fails its insert and its
// whole transaction, charge included, rolls back: reported as owned.
async function buy(userId: string, rawKey: unknown) {
    if (typeof rawKey !== "string") throw new CosmeticError("Unknown item.", 400);

    try {
        const result = await prisma.$transaction(async (tx) => {
            const item = await tx.cosmeticItem.findUnique({ where: { key: rawKey } });

            if (!item || !isAvailable(item) || !isCosmeticSlot(item.slot)) {
                throw new CosmeticError("That item isn't available.", 404);
            }

            if (item.cost === 0) return { alreadyOwned: true as const, balances: null };

            if (item.minConstellations) {
                const charted = await tx.chartedStar.findMany({
                    where: { userId },
                    select: { constellationId: true, starIndex: true },
                });
                const complete = CONSTELLATIONS.filter((constellation) => isComplete(constellation, charted)).length;

                if (complete < item.minConstellations) {
                    throw new CosmeticError(`Fully chart ${item.minConstellations} constellations to unlock ${item.name}.`, 403);
                }
            }

            const [charged] = await tx.starChart.updateManyAndReturn({
                where: { userId, starlight: { gte: item.cost }, lifetimeStarlight: { gte: item.minLifetime ?? 0 } },
                data: { starlight: { decrement: item.cost } },
                select: { starlight: true, lifetimeStarlight: true },
            });

            if (!charged) {
                const chart = await tx.starChart.findUnique({ where: { userId }, select: { lifetimeStarlight: true } });

                if (item.minLifetime && (chart?.lifetimeStarlight ?? 0) < item.minLifetime) {
                    throw new CosmeticError(`${item.name} unlocks at ${item.minLifetime} lifetime Starlight.`, 403);
                }

                throw new CosmeticError(`Not enough Starlight for ${item.name} yet.`, 402);
            }

            await tx.userCosmetic.create({ data: { userId, itemId: item.id } });
            await tx.starlightLedger.create({ data: { userId, delta: -item.cost, reason: `purchase:${item.key}` } });

            return { alreadyOwned: false as const, balances: charged };
        });

        return NextResponse.json({
            success: true,
            key: rawKey,
            alreadyOwned: result.alreadyOwned,
            starlight: result.balances?.starlight ?? null,
            lifetimeStarlight: result.balances?.lifetimeStarlight ?? null,
        });
    } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
            return NextResponse.json({ success: true, key: rawKey, alreadyOwned: true, starlight: null, lifetimeStarlight: null });
        }

        throw error;
    }
}

// Free and instant. Equipping a slot's default deletes its loadout row (no
// row = default), so defaults never need seeded rows.
async function equip(userId: string, rawKey: unknown) {
    if (typeof rawKey !== "string") throw new CosmeticError("Unknown item.", 400);

    const defaultSlot = (Object.entries(DEFAULT_LOADOUT) as [CosmeticSlot, string][]).find(([, key]) => key === rawKey)?.[0];

    if (defaultSlot) {
        await prisma.cosmeticLoadout.deleteMany({ where: { userId, slot: defaultSlot } });
        return NextResponse.json({ success: true, slot: defaultSlot, key: rawKey });
    }

    const owned = await prisma.userCosmetic.findFirst({
        where: { userId, item: { key: rawKey } },
        select: { item: { select: { id: true, slot: true } } },
    });

    if (!owned || !isCosmeticSlot(owned.item.slot)) {
        throw new CosmeticError("You don't own that yet.", 403);
    }

    await prisma.cosmeticLoadout.upsert({
        where: { userId_slot: { userId, slot: owned.item.slot } },
        create: { userId, slot: owned.item.slot, itemId: owned.item.id },
        update: { itemId: owned.item.id },
    });

    return NextResponse.json({ success: true, slot: owned.item.slot, key: rawKey });
}

// The first name is free; each change after that costs
// SHIP_NAME_CHANGE_COST through the same conditional decrement + ledger.
async function renameShip(userId: string, rawName: unknown) {
    const parsed = normalizeShipName(rawName);

    if (!parsed.ok) throw new CosmeticError(parsed.error, 400);

    const name = parsed.name;

    const result = await prisma.$transaction(async (tx) => {
        const [named] = await tx.starChart.updateManyAndReturn({
            where: { userId, shipName: null },
            data: { shipName: name },
            select: { starlight: true, lifetimeStarlight: true, shipName: true },
        });

        if (named) return { ...named, charged: 0 };

        const [renamed] = await tx.starChart.updateManyAndReturn({
            where: { userId, starlight: { gte: SHIP_NAME_CHANGE_COST }, NOT: [{ shipName: null }, { shipName: name }] },
            data: { shipName: name, starlight: { decrement: SHIP_NAME_CHANGE_COST } },
            select: { starlight: true, lifetimeStarlight: true, shipName: true },
        });

        if (!renamed) {
            const chart = await tx.starChart.findUnique({
                where: { userId },
                select: { starlight: true, lifetimeStarlight: true, shipName: true },
            });

            if (!chart) throw new CosmeticError("Open the Star Chart once before naming your ship.", 404);
            if (chart.shipName === name) return { ...chart, charged: 0 };

            throw new CosmeticError(`Renaming costs ${SHIP_NAME_CHANGE_COST} Starlight.`, 402);
        }

        await tx.starlightLedger.create({
            data: { userId, delta: -SHIP_NAME_CHANGE_COST, reason: "purchase:ship_name_change" },
        });

        return { ...renamed, charged: SHIP_NAME_CHANGE_COST };
    });

    return NextResponse.json({
        success: true,
        shipName: result.shipName,
        starlight: result.starlight,
        lifetimeStarlight: result.lifetimeStarlight,
        charged: result.charged,
    });
}
