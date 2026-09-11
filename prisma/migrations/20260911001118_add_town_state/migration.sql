-- CreateTable
CREATE TABLE "TownState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" INTEGER NOT NULL DEFAULT 0,
    "libraryGrowth" INTEGER NOT NULL DEFAULT 0,
    "workshopGrowth" INTEGER NOT NULL DEFAULT 0,
    "trainingGroundsGrowth" INTEGER NOT NULL DEFAULT 0,
    "watchtowerGrowth" INTEGER NOT NULL DEFAULT 0,
    "townSquareGrowth" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "graceTokens" INTEGER NOT NULL DEFAULT 2,
    "lastGoodDay" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TownState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TownState_userId_key" ON "TownState"("userId");

-- AddForeignKey
ALTER TABLE "TownState" ADD CONSTRAINT "TownState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
