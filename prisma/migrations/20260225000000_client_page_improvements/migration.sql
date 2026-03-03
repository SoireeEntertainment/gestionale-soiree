-- AlterTable clients: website + industry category
ALTER TABLE "clients" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "clients" ADD COLUMN "industryCategory" TEXT;

-- CreateTable client_assignees
CREATE TABLE "client_assignees" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSIGNEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_assignees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_assignees_clientId_userId_key" ON "client_assignees"("clientId", "userId");
CREATE INDEX "client_assignees_clientId_idx" ON "client_assignees"("clientId");
CREATE INDEX "client_assignees_userId_idx" ON "client_assignees"("userId");

ALTER TABLE "client_assignees" ADD CONSTRAINT "client_assignees_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_assignees" ADD CONSTRAINT "client_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable client_renewals: status
ALTER TABLE "client_renewals" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DA_FARE';
