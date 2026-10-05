-- AlterTable
ALTER TABLE "StarChart" ADD COLUMN     "customStarlightDay" TEXT,
ADD COLUMN     "customStarlightToday" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unlockedRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];
