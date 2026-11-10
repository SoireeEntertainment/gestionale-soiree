-- AlterTable: collegamento opzionale Work ← DailyTask (1 lavoro max per task)
ALTER TABLE "works" ADD COLUMN IF NOT EXISTS "sourceDailyTaskId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "works_sourceDailyTaskId_key" ON "works"("sourceDailyTaskId");

-- AddForeignKey: elimina Task → SetNull sul Work (il lavoro resta)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'works_sourceDailyTaskId_fkey'
  ) THEN
    ALTER TABLE "works"
      ADD CONSTRAINT "works_sourceDailyTaskId_fkey"
      FOREIGN KEY ("sourceDailyTaskId") REFERENCES "daily_tasks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
