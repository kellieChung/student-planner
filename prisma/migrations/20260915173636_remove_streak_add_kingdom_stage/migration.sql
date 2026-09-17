-- AlterTable
ALTER TABLE "TownState" DROP COLUMN "currentStreak",
DROP COLUMN "graceTokens",
DROP COLUMN "lastGoodDay",
DROP COLUMN "longestStreak",
ADD COLUMN     "kingdomStage" TEXT NOT NULL DEFAULT 'village';
