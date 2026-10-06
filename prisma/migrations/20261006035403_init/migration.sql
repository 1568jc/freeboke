-- CreateTable
CREATE TABLE "Episode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "audioPath" TEXT,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "episodeId" INTEGER NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "segments" TEXT NOT NULL,
    CONSTRAINT "Transcript_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Article" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "episodeId" INTEGER NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'deep',
    "contentMd" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Article_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_episodeId_key" ON "Transcript"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_episodeId_key" ON "Article"("episodeId");
