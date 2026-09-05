-- AlterTable: campo dominio opzionale (nullable). Non tocca dati esistenti.
ALTER TABLE "client_renewals" ADD COLUMN IF NOT EXISTS "domain" TEXT;
