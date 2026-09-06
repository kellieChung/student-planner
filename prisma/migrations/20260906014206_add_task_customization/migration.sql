-- CreateTable
CREATE TABLE "TaskCustomization" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskCustomization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCustomization_userId_idx" ON "TaskCustomization"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCustomization_userId_taskId_key" ON "TaskCustomization"("userId", "taskId");

-- AddForeignKey
ALTER TABLE "TaskCustomization" ADD CONSTRAINT "TaskCustomization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
