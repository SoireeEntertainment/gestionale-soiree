-- CreateTable
CREATE TABLE "client_shootings" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_shootings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shooting_reels" (
    "id" TEXT NOT NULL,
    "shootingId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shooting_reels_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ped_items" ADD COLUMN "shootingReelId" TEXT;

-- CreateIndex
CREATE INDEX "client_shootings_clientId_date_idx" ON "client_shootings"("clientId", "date");

-- CreateIndex
CREATE INDEX "shooting_reels_shootingId_idx" ON "shooting_reels"("shootingId");

-- CreateIndex
CREATE INDEX "ped_items_shootingReelId_idx" ON "ped_items"("shootingReelId");

-- AddForeignKey
ALTER TABLE "client_shootings" ADD CONSTRAINT "client_shootings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shooting_reels" ADD CONSTRAINT "shooting_reels_shootingId_fkey" FOREIGN KEY ("shootingId") REFERENCES "client_shootings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ped_items" ADD CONSTRAINT "ped_items_shootingReelId_fkey" FOREIGN KEY ("shootingReelId") REFERENCES "shooting_reels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
