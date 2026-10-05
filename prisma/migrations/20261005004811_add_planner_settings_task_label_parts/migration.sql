-- AlterTable
ALTER TABLE "PlannerSettings" ADD COLUMN     "taskLabelParts" TEXT[] DEFAULT ARRAY['course', 'type', 'day', 'name']::TEXT[];
