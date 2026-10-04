-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "canvasSubmitted" BOOLEAN;

-- AlterTable
ALTER TABLE "TaskCustomization" ADD COLUMN     "completedFromCanvas" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlannerSettings" ADD COLUMN     "completeFromCanvas" BOOLEAN NOT NULL DEFAULT true;
