-- CreateTable
CREATE TABLE "AnnouncementSuggestionReview" (
    "id" TEXT NOT NULL,
    "sourceAnnouncementId" TEXT NOT NULL,
    "suggestionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AnnouncementSuggestionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementSuggestionReview_userId_idx" ON "AnnouncementSuggestionReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementSuggestionReview_userId_sourceAnnouncementId_su_key" ON "AnnouncementSuggestionReview"("userId", "sourceAnnouncementId", "suggestionKey");

-- AddForeignKey
ALTER TABLE "AnnouncementSuggestionReview" ADD CONSTRAINT "AnnouncementSuggestionReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
