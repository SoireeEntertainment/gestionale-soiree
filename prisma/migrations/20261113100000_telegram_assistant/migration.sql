-- Telegram assistant: account linking, update dedupe, job queue, digest prefs

-- AlterTable ChatThread: channel source for telegram threads
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'web';
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "external_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "chat_threads_userId_source_external_key_key"
  ON "chat_threads"("userId", "source", "external_key");

-- AlterTable UserPreference: daily telegram digest
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_digest_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_digest_hour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_digest_minute" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_digest_days" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INTEGER[];
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_digest_last_sent" TEXT;

-- CreateTable telegram_connections
CREATE TABLE IF NOT EXISTS "telegram_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_connections_userId_key" ON "telegram_connections"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_connections_telegramUserId_key" ON "telegram_connections"("telegramUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_connections_telegramChatId_key" ON "telegram_connections"("telegramChatId");

-- CreateTable telegram_link_tokens
CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_link_tokens_tokenHash_key" ON "telegram_link_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_userId_idx" ON "telegram_link_tokens"("userId");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_expiresAt_idx" ON "telegram_link_tokens"("expiresAt");

-- CreateTable telegram_processed_updates
CREATE TABLE IF NOT EXISTS "telegram_processed_updates" (
    "updateId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_processed_updates_pkey" PRIMARY KEY ("updateId")
);

-- CreateTable telegram_jobs
CREATE TABLE IF NOT EXISTS "telegram_jobs" (
    "id" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'update',
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_jobs_updateId_key" ON "telegram_jobs"("updateId");
CREATE INDEX IF NOT EXISTS "telegram_jobs_status_availableAt_idx" ON "telegram_jobs"("status", "availableAt");

-- FKs
DO $$ BEGIN
  ALTER TABLE "telegram_connections"
    ADD CONSTRAINT "telegram_connections_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
