-- AlterTable
ALTER TABLE "CustomTask" ADD COLUMN     "recurrenceId" TEXT,
ADD COLUMN     "recurrenceOverridden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecurringTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "typeOverride" TEXT,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "dueTime" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTask_userId_idx" ON "RecurringTask"("userId");

-- CreateIndex
CREATE INDEX "CustomTask_recurrenceId_idx" ON "CustomTask"("recurrenceId");

-- AddForeignKey
ALTER TABLE "CustomTask" ADD CONSTRAINT "CustomTask_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "RecurringTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
