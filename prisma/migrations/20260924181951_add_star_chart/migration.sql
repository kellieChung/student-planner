-- CreateTable
CREATE TABLE "StarChart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "starlight" INTEGER NOT NULL DEFAULT 0,
    "lifetimeStarlight" INTEGER NOT NULL DEFAULT 0,
    "onboardedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartedStar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "constellationId" TEXT NOT NULL,
    "starIndex" INTEGER NOT NULL,
    "chartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartedStar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StarChart_userId_key" ON "StarChart"("userId");

-- CreateIndex
CREATE INDEX "ChartedStar_userId_idx" ON "ChartedStar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartedStar_userId_constellationId_starIndex_key" ON "ChartedStar"("userId", "constellationId", "starIndex");

-- AddForeignKey
ALTER TABLE "StarChart" ADD CONSTRAINT "StarChart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartedStar" ADD CONSTRAINT "ChartedStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing town coins over as Starlight. Town currency was never
-- spendable, so the carried balance is also the lifetime total.
INSERT INTO "StarChart" ("id", "userId", "starlight", "lifetimeStarlight", "updatedAt")
SELECT gen_random_uuid()::text, "userId", "currency", "currency", CURRENT_TIMESTAMP
FROM "TownState"
ON CONFLICT ("userId") DO NOTHING;
