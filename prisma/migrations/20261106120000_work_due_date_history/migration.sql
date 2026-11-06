-- AlterTable
ALTER TABLE "works" ADD COLUMN "originalDeadline" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "work_due_date_history" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "previousDeadline" TIMESTAMP(3),
    "newDeadline" TIMESTAMP(3),
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" TEXT NOT NULL,
    "note" TEXT,
    "isOriginal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "work_due_date_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_due_date_history_workId_changedAt_idx" ON "work_due_date_history"("workId", "changedAt");

-- CreateIndex
CREATE INDEX "work_due_date_history_changedByUserId_idx" ON "work_due_date_history"("changedByUserId");

-- AddForeignKey
ALTER TABLE "work_due_date_history" ADD CONSTRAINT "work_due_date_history_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_due_date_history" ADD CONSTRAINT "work_due_date_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: preserve current deadline as original when present
UPDATE "works"
SET "originalDeadline" = "deadline"
WHERE "deadline" IS NOT NULL AND "originalDeadline" IS NULL;
