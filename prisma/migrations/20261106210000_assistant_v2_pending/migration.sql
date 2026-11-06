-- Assistant V2: pending actions + chat message index
CREATE TABLE IF NOT EXISTS "assistant_pending_actions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT,
    "toolName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "preview" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_pending_actions_idempotencyKey_key"
  ON "assistant_pending_actions"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "assistant_pending_actions_userId_threadId_status_idx"
  ON "assistant_pending_actions"("userId", "threadId", "status");

CREATE INDEX IF NOT EXISTS "assistant_pending_actions_expiresAt_idx"
  ON "assistant_pending_actions"("expiresAt");

CREATE INDEX IF NOT EXISTS "chat_messages_threadId_createdAt_idx"
  ON "chat_messages"("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "assistant_action_logs_createdAt_idx"
  ON "assistant_action_logs"("createdAt");
