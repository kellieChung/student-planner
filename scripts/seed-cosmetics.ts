import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { COSMETIC_CATALOG } from "@/lib/cosmetics";

// Syncs the CosmeticItem table to lib/cosmetics.ts, keyed on `key`. Safe to
// re-run: one read, one createMany for new keys, and an update only for rows
// whose fields changed. Items removed from the catalog are left alone (they
// may be owned); set them inactive by hand instead.
// Run: npx tsx scripts/seed-cosmetics.ts   (writes the shared database)
async function main() {
    const existing = await prisma.cosmeticItem.findMany();
    const byKey = new Map(existing.map((item) => [item.key, item]));

    const toCreate = COSMETIC_CATALOG.filter((item) => !byKey.has(item.key)).map((item) => ({
        key: item.key,
        slot: item.slot,
        name: item.name,
        description: item.description,
        cost: item.cost,
        sortOrder: item.sortOrder,
        minLifetime: item.minLifetime ?? null,
        minConstellations: item.minConstellations ?? null,
    }));

    const toUpdate = COSMETIC_CATALOG.filter((item) => {
        const row = byKey.get(item.key);
        return row && (
            row.slot !== item.slot
            || row.name !== item.name
            || row.description !== item.description
            || row.cost !== item.cost
            || row.sortOrder !== item.sortOrder
            || row.minLifetime !== (item.minLifetime ?? null)
            || row.minConstellations !== (item.minConstellations ?? null)
        );
    });

    if (toCreate.length > 0) {
        await prisma.cosmeticItem.createMany({ data: toCreate, skipDuplicates: true });
    }

    for (const item of toUpdate) {
        await prisma.cosmeticItem.update({
            where: { key: item.key },
            data: {
                slot: item.slot,
                name: item.name,
                description: item.description,
                cost: item.cost,
                sortOrder: item.sortOrder,
                minLifetime: item.minLifetime ?? null,
                minConstellations: item.minConstellations ?? null,
            },
        });
    }

    console.log(`Cosmetics: ${toCreate.length} created, ${toUpdate.length} updated, ${existing.length} already present.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
