/*
  Warnings:

  - Added the required column `updatedAt` to the `AnnouncementSuggestionReview` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Backfill existing rows' updatedAt with now() (via the DEFAULT), matching
-- their status: they're historical accept/reject decisions with no real
-- "last updated" timestamp to recover, so "now" is the honest answer.
ALTER TABLE "AnnouncementSuggestionReview" ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "taskSnapshot" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop the DEFAULT after backfilling so Prisma's own @updatedAt trigger
-- logic (not a DB-level default) is what governs it from here on, matching
-- how every other @updatedAt column in this schema is declared.
ALTER TABLE "AnnouncementSuggestionReview" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CustomTask" ADD COLUMN     "aiTagDismissedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlannerSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autoAcceptAiTasks" BOOLEAN NOT NULL DEFAULT false,
    "lastRundownViewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTaskEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceAnnouncementId" TEXT,
    "suggestionKey" TEXT,
    "taskId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AiTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerSettings_userId_key" ON "PlannerSettings"("userId");

-- CreateIndex
CREATE INDEX "AiTaskEvent_userId_type_createdAt_idx" ON "AiTaskEvent"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AnnouncementSuggestionReview_userId_status_idx" ON "AnnouncementSuggestionReview"("userId", "status");

-- AddForeignKey
ALTER TABLE "PlannerSettings" ADD CONSTRAINT "PlannerSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTaskEvent" ADD CONSTRAINT "AiTaskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
