import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Reused across dev hot reloads: each reload would otherwise open a new pg
// pool, and local dev shares the production database's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
    const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL!,
        // Every serverless instance gets its own pool, and a suspended
        // instance never runs the idle timer, so its connections stay open.
        // With pg's default of 10 per instance, a handful of instances used
        // up the database role's whole limit (2026-09-26 outage). A small cap
        // and short idle timeout keep each instance's footprint low; the
        // production URL should also go through pooled.db.prisma.io.
        max: 5,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 10_000,
    });

    return new PrismaClient({
        adapter,
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
