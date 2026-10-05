-- The retired medieval-town layer (replaced by the Star Chart, gamificationSystem.md).
-- DropForeignKey
ALTER TABLE "TownState" DROP CONSTRAINT "TownState_userId_fkey";

-- DropForeignKey
ALTER TABLE "WorldLayout" DROP CONSTRAINT "WorldLayout_userId_fkey";

-- DropTable
DROP TABLE "TownState";

-- DropTable
DROP TABLE "WorldLayout";
