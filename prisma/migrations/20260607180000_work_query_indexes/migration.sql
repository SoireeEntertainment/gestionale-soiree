-- CreateIndex
CREATE INDEX "works_deadline_idx" ON "works"("deadline");

-- CreateIndex
CREATE INDEX "works_status_idx" ON "works"("status");

-- CreateIndex
CREATE INDEX "works_clientId_idx" ON "works"("clientId");

-- CreateIndex
CREATE INDEX "works_categoryId_idx" ON "works"("categoryId");

-- CreateIndex
CREATE INDEX "works_assignedToUserId_idx" ON "works"("assignedToUserId");
