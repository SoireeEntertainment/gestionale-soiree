-- AlterTable
ALTER TABLE "ped_client_settings" ADD COLUMN "publishingWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
