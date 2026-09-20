-- Enforce one PedItem per ShootingReel (PostgreSQL UNIQUE allows multiple NULLs).
-- Safe if the previous non-unique index already exists from 20260803140000_client_shooting_reels.
DROP INDEX IF EXISTS "ped_items_shootingReelId_idx";
CREATE UNIQUE INDEX "ped_items_shootingReelId_key" ON "ped_items"("shootingReelId");
