/*
  Warnings:

  - Added the required column `operationId` to the `BookingAudit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `BookingAudit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BookingAuditSource" AS ENUM ('api_v1', 'api_v2', 'webapp', 'webhook', 'unknown');

-- AlterEnum
ALTER TYPE "AuditActorType" ADD VALUE 'app';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingAuditAction" ADD VALUE 'seat_booked';
ALTER TYPE "BookingAuditAction" ADD VALUE 'seat_rescheduled';

-- AlterTable
ALTER TABLE "BookingAudit" ADD COLUMN     "operationId" TEXT NOT NULL,
ADD COLUMN     "source" "BookingAuditSource" NOT NULL;

-- CreateIndex
CREATE INDEX "BookingAudit_operationId_idx" ON "BookingAudit"("operationId");
