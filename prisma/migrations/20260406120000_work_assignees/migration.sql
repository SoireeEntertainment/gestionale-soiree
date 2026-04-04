-- CreateTable
CREATE TABLE "work_assignees" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSIGNEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_assignees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_assignees_workId_userId_key" ON "work_assignees"("workId", "userId");

CREATE INDEX "work_assignees_workId_idx" ON "work_assignees"("workId");

CREATE INDEX "work_assignees_userId_idx" ON "work_assignees"("userId");

ALTER TABLE "work_assignees" ADD CONSTRAINT "work_assignees_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_assignees" ADD CONSTRAINT "work_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
