-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "enablePerHostLocations" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HostLocation" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventTypeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "credentialId" INTEGER,
    "link" TEXT,
    "address" TEXT,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HostLocation_credentialId_idx" ON "HostLocation"("credentialId");

-- CreateIndex
CREATE INDEX "HostLocation_eventTypeId_idx" ON "HostLocation"("eventTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "HostLocation_userId_eventTypeId_key" ON "HostLocation"("userId", "eventTypeId");

-- AddForeignKey
ALTER TABLE "HostLocation" ADD CONSTRAINT "HostLocation_userId_eventTypeId_fkey" FOREIGN KEY ("userId", "eventTypeId") REFERENCES "Host"("userId", "eventTypeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostLocation" ADD CONSTRAINT "HostLocation_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
