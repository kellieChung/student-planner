import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Reused across dev hot reloads: each reload would otherwise open a new pg
// pool, and local dev shares the production database's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
    const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL!,
    });

    return new PrismaClient({
        adapter,
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
