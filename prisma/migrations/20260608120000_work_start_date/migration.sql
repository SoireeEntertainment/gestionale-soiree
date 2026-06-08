-- AlterTable
ALTER TABLE "works" ADD COLUMN "startDate" TIMESTAMP(3);

-- Backfill: existing works use createdAt as implicit start
UPDATE "works" SET "startDate" = "createdAt" WHERE "startDate" IS NULL;

-- CreateIndex
CREATE INDEX "works_startDate_idx" ON "works"("startDate");
