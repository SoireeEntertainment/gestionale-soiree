-- CreateTable
CREATE TABLE "client_renewals" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "billingDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_renewals_clientId_renewalDate_idx" ON "client_renewals"("clientId", "renewalDate");

-- AddForeignKey
ALTER TABLE "client_renewals" ADD CONSTRAINT "client_renewals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
