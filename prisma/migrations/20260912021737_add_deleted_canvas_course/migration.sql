-- CreateTable
CREATE TABLE "DeletedCanvasCourse" (
    "id" TEXT NOT NULL,
    "canvasOrigin" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DeletedCanvasCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedCanvasCourse_userId_idx" ON "DeletedCanvasCourse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeletedCanvasCourse_userId_canvasOrigin_canvasId_key" ON "DeletedCanvasCourse"("userId", "canvasOrigin", "canvasId");

-- AddForeignKey
ALTER TABLE "DeletedCanvasCourse" ADD CONSTRAINT "DeletedCanvasCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
