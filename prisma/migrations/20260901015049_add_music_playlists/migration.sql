-- CreateTable
CREATE TABLE "MusicPlaylist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MusicPlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "thumbnail" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "playlistId" TEXT NOT NULL,

    CONSTRAINT "MusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MusicPlaylist_userId_idx" ON "MusicPlaylist"("userId");

-- CreateIndex
CREATE INDEX "MusicTrack_playlistId_idx" ON "MusicTrack"("playlistId");

-- AddForeignKey
ALTER TABLE "MusicPlaylist" ADD CONSTRAINT "MusicPlaylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "MusicPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
