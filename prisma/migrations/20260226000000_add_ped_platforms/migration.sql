-- AlterTable ped_client_settings: add platforms (default INSTAGRAM)
ALTER TABLE "ped_client_settings" ADD COLUMN "platforms" TEXT[] NOT NULL DEFAULT ARRAY['INSTAGRAM'];

-- AlterTable ped_items: add platforms (default INSTAGRAM)
ALTER TABLE "ped_items" ADD COLUMN "platforms" TEXT[] NOT NULL DEFAULT ARRAY['INSTAGRAM'];
