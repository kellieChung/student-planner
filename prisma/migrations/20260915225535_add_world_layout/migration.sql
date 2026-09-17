-- CreateTable
CREATE TABLE "WorldLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldLayout_userId_key" ON "WorldLayout"("userId");

-- AddForeignKey
ALTER TABLE "WorldLayout" ADD CONSTRAINT "WorldLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
