-- AlterTable
ALTER TABLE "StarChart" ADD COLUMN     "claimedRewards" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "StarlightLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarlightLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StarlightLedger_userId_createdAt_idx" ON "StarlightLedger"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StarlightLedger" ADD CONSTRAINT "StarlightLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
