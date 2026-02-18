-- AlterTable
ALTER TABLE "ped_items" ADD COLUMN IF NOT EXISTS "label" TEXT;

-- Backfill: da priority/status a label (retrocompat)
UPDATE "ped_items"
SET "label" = CASE
  WHEN "status" = 'DONE' THEN 'FATTO'
  WHEN "priority" = 'URGENT' THEN 'IN_APPROVAZIONE'
  WHEN "priority" = 'NOT_URGENT' THEN 'PRONTO_NON_PUBBLICATO'
  ELSE 'DA_FARE'
END
WHERE "label" IS NULL;
