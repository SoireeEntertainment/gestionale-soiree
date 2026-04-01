-- AlterTable
ALTER TABLE "preventivi" ADD COLUMN "prospectName" TEXT;

-- Allow preventivi without an anagrafica client (solo nome esterno)
ALTER TABLE "preventivi" ALTER COLUMN "clientId" DROP NOT NULL;
