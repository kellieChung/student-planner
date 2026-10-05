-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "pointsPossible" DOUBLE PRECISION,
ADD COLUMN     "submissionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
