-- AlterTable
ALTER TABLE "TaskCustomization" ADD COLUMN     "dueAtOverride" TIMESTAMP(3),
ADD COLUMN     "nameOverride" TEXT,
ADD COLUMN     "typeOverride" TEXT;
