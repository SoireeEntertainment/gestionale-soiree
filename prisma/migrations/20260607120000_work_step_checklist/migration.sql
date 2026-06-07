-- AlterTable
ALTER TABLE "work_steps" ADD COLUMN "description" TEXT;
ALTER TABLE "work_steps" ADD COLUMN "completedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "work_steps" ADD CONSTRAINT "work_steps_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
