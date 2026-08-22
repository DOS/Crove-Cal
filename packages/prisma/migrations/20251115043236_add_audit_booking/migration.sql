-- CreateEnum
CREATE TYPE "BookingAuditType" AS ENUM ('record_created', 'record_updated', 'record_deleted');

-- CreateEnum
CREATE TYPE "BookingAuditAction" AS ENUM ('created', 'cancelled', 'accepted', 'rejected', 'pending', 'awaiting_host', 'rescheduled', 'attendee_added', 'attendee_removed', 'reassignment', 'location_changed', 'host_no_show_updated', 'attendee_no_show_updated', 'reschedule_requested');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('user', 'guest', 'attendee', 'system');

-- CreateTable
CREATE TABLE "AuditActor" (
    "id" TEXT NOT NULL,
    "type" "AuditActorType" NOT NULL,
    "userUuid" UUID,
    "attendeeId" INTEGER,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditActor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAudit" (
    "id" UUID NOT NULL,
    "bookingUid" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "BookingAuditType" NOT NULL,
    "action" "BookingAuditAction" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB,

    CONSTRAINT "BookingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditActor_email_idx" ON "AuditActor"("email");

-- CreateIndex
CREATE INDEX "AuditActor_userUuid_idx" ON "AuditActor"("userUuid");

-- CreateIndex
CREATE INDEX "AuditActor_attendeeId_idx" ON "AuditActor"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditActor_userUuid_key" ON "AuditActor"("userUuid");

-- CreateIndex
CREATE UNIQUE INDEX "AuditActor_attendeeId_key" ON "AuditActor"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditActor_email_key" ON "AuditActor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuditActor_phone_key" ON "AuditActor"("phone");

-- CreateIndex
CREATE INDEX "BookingAudit_actorId_idx" ON "BookingAudit"("actorId");

-- CreateIndex
CREATE INDEX "BookingAudit_bookingUid_idx" ON "BookingAudit"("bookingUid");

-- CreateIndex
CREATE INDEX "BookingAudit_timestamp_idx" ON "BookingAudit"("timestamp");

-- AddForeignKey
ALTER TABLE "BookingAudit" ADD CONSTRAINT "BookingAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AuditActor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
