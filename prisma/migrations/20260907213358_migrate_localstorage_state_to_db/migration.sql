-- AlterTable
ALTER TABLE "TaskCustomization" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "due" TEXT,
    "dueAt" TIMESTAMP(3),
    "dueFraction" DOUBLE PRECISION,
    "shortTitle" TEXT,
    "sourceAnnouncementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CustomTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPlanningEstimate" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "importance" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "consequence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "assignmentType" TEXT,
    "priorityScore" DOUBLE PRECISION NOT NULL,
    "urgencyScore" DOUBLE PRECISION NOT NULL,
    "frogScore" DOUBLE PRECISION NOT NULL,
    "priorityReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskPlanningEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcrastinationRecord" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ProcrastinationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomTask_userId_idx" ON "CustomTask"("userId");

-- CreateIndex
CREATE INDEX "TaskPlanningEstimate_userId_idx" ON "TaskPlanningEstimate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskPlanningEstimate_userId_taskId_key" ON "TaskPlanningEstimate"("userId", "taskId");

-- CreateIndex
CREATE INDEX "ProcrastinationRecord_userId_taskType_idx" ON "ProcrastinationRecord"("userId", "taskType");

-- AddForeignKey
ALTER TABLE "CustomTask" ADD CONSTRAINT "CustomTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPlanningEstimate" ADD CONSTRAINT "TaskPlanningEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcrastinationRecord" ADD CONSTRAINT "ProcrastinationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
