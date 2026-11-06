-- Finalize daily_tasks reliability.
--
-- Documentazione migrazione UserTodo → DailyTask (migration precedente):
-- - user_todos NON viene eliminata (nessun DROP/DELETE sui promemoria originali).
-- - dueDate assegnata in migrazione è una DATA TECNICA INIZIALE (noon UTC del giorno
--   di migrate), perché i vecchi promemoria non avevano scadenza.
-- - completedAt da createdAt NON è affidabile come data di completamento storico.
--
-- Questa migration:
-- 1) azzera completedAt inventato sui record migrated_*;
-- 2) annota la dueDate tecnica sui migrated_* ancora senza nota;
-- 3) deduplica CONTACT_CLIENT per (userId, clientId) senza cancellare righe
--    (i duplicati restano come GENERAL con nota tecnica);
-- 4) crea unique partial index anti-duplicato contatto.

-- Promemoria migrati: azzera completedAt inventato (createdAt ≠ completamento).
UPDATE "daily_tasks"
SET "completedAt" = NULL
WHERE "id" LIKE 'migrated_%'
  AND "completedAt" IS NOT NULL;

-- Annota che dueDate è tecnica (solo se notes ancora vuota).
UPDATE "daily_tasks"
SET "notes" = '[migrazione] scadenza tecnica iniziale (i vecchi promemoria non avevano dueDate)'
WHERE "id" LIKE 'migrated_%'
  AND ("notes" IS NULL OR btrim("notes") = '');

-- Converte i duplicati CONTACT_CLIENT (tiene il più recente per updatedAt).
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "clientId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "daily_tasks"
  WHERE "type" = 'CONTACT_CLIENT'
    AND "clientId" IS NOT NULL
)
UPDATE "daily_tasks" AS dt
SET
  "type" = 'GENERAL',
  "notes" = CONCAT(
    COALESCE(dt."notes" || E'\n', ''),
    '[sistema] ex-tracker contatto duplicato (mantenuto come task GENERAL)'
  )
FROM ranked
WHERE dt."id" = ranked."id"
  AND ranked.rn > 1;

-- Vincolo robusto anti-duplicato contatto (non limita le task GENERAL).
CREATE UNIQUE INDEX IF NOT EXISTS "daily_tasks_user_client_contact_unique"
ON "daily_tasks" ("userId", "clientId")
WHERE "type" = 'CONTACT_CLIENT' AND "clientId" IS NOT NULL;
