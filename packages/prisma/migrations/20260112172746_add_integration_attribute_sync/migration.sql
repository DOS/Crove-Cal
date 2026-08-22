-- CreateTable
CREATE TABLE "IntegrationAttributeSync" (
    "id" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "credentialId" INTEGER,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationAttributeSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeSyncRule" (
    "id" TEXT NOT NULL,
    "integrationAttributeSyncId" TEXT NOT NULL,
    "rule" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeSyncRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeSyncFieldMapping" (
    "id" TEXT NOT NULL,
    "integrationFieldName" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "integrationAttributeSyncId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeSyncFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationAttributeSync_organizationId_idx" ON "IntegrationAttributeSync"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeSyncRule_integrationAttributeSyncId_key" ON "AttributeSyncRule"("integrationAttributeSyncId");

-- CreateIndex
CREATE INDEX "AttributeSyncFieldMapping_integrationAttributeSyncId_idx" ON "AttributeSyncFieldMapping"("integrationAttributeSyncId");

-- AddForeignKey
ALTER TABLE "IntegrationAttributeSync" ADD CONSTRAINT "IntegrationAttributeSync_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAttributeSync" ADD CONSTRAINT "IntegrationAttributeSync_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeSyncRule" ADD CONSTRAINT "AttributeSyncRule_integrationAttributeSyncId_fkey" FOREIGN KEY ("integrationAttributeSyncId") REFERENCES "IntegrationAttributeSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeSyncFieldMapping" ADD CONSTRAINT "AttributeSyncFieldMapping_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeSyncFieldMapping" ADD CONSTRAINT "AttributeSyncFieldMapping_integrationAttributeSyncId_fkey" FOREIGN KEY ("integrationAttributeSyncId") REFERENCES "IntegrationAttributeSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;
