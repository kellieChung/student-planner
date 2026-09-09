-- CreateTable
CREATE TABLE "GamificationState" (
    "id" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "awardedTaskIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GamificationState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamificationState_userId_key" ON "GamificationState"("userId");

-- AddForeignKey
ALTER TABLE "GamificationState" ADD CONSTRAINT "GamificationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
