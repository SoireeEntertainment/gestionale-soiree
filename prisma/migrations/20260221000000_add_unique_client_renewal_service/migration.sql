-- CreateUniqueIndex
CREATE UNIQUE INDEX "client_renewals_clientId_serviceName_key" ON "client_renewals"("clientId", "serviceName");
