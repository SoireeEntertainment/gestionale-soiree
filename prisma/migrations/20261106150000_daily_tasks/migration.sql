-- CreateTable
CREATE TABLE "daily_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "completedAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "nextReactivateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_tasks_userId_status_idx" ON "daily_tasks"("userId", "status");

-- CreateIndex
CREATE INDEX "daily_tasks_userId_type_clientId_idx" ON "daily_tasks"("userId", "type", "clientId");

-- CreateIndex
CREATE INDEX "daily_tasks_dueDate_idx" ON "daily_tasks"("dueDate");

-- CreateIndex
CREATE INDEX "daily_tasks_nextReactivateAt_idx" ON "daily_tasks"("nextReactivateAt");

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migra i vecchi promemoria UserTodo → DailyTask (scadenza = oggi noon UTC)
INSERT INTO "daily_tasks" (
  "id", "title", "type", "status", "dueDate", "notes", "userId", "clientId",
  "completedAt", "lastContactedAt", "nextReactivateAt", "createdAt", "updatedAt"
)
SELECT
  'migrated_' || ut."id",
  ut."title",
  'GENERAL',
  CASE WHEN ut."completed" THEN 'DONE' ELSE 'OPEN' END,
  (CURRENT_DATE::timestamp + INTERVAL '12 hours'),
  NULL,
  ut."userId",
  NULL,
  CASE WHEN ut."completed" THEN ut."createdAt" ELSE NULL END,
  NULL,
  NULL,
  ut."createdAt",
  ut."createdAt"
FROM "user_todos" ut
WHERE NOT EXISTS (
  SELECT 1 FROM "daily_tasks" dt WHERE dt."id" = 'migrated_' || ut."id"
);
