-- CreateEnum
CREATE TYPE "WrongAssignmentReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "WrongAssignmentReport" (
    "id" UUID NOT NULL,
    "bookingUid" TEXT NOT NULL,
    "reportedById" INTEGER,
    "correctAssignee" TEXT,
    "additionalNotes" TEXT NOT NULL,
    "teamId" INTEGER,
    "routingFormId" TEXT,
    "status" "WrongAssignmentReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrongAssignmentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WrongAssignmentReport_bookingUid_key" ON "WrongAssignmentReport"("bookingUid");

-- CreateIndex
CREATE INDEX "WrongAssignmentReport_reportedById_idx" ON "WrongAssignmentReport"("reportedById");

-- CreateIndex
CREATE INDEX "WrongAssignmentReport_teamId_idx" ON "WrongAssignmentReport"("teamId");

-- CreateIndex
CREATE INDEX "WrongAssignmentReport_routingFormId_idx" ON "WrongAssignmentReport"("routingFormId");

-- CreateIndex
CREATE INDEX "WrongAssignmentReport_status_idx" ON "WrongAssignmentReport"("status");

-- CreateIndex
CREATE INDEX "WrongAssignmentReport_createdAt_idx" ON "WrongAssignmentReport"("createdAt");

-- AddForeignKey
ALTER TABLE "WrongAssignmentReport" ADD CONSTRAINT "WrongAssignmentReport_bookingUid_fkey" FOREIGN KEY ("bookingUid") REFERENCES "Booking"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongAssignmentReport" ADD CONSTRAINT "WrongAssignmentReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongAssignmentReport" ADD CONSTRAINT "WrongAssignmentReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongAssignmentReport" ADD CONSTRAINT "WrongAssignmentReport_routingFormId_fkey" FOREIGN KEY ("routingFormId") REFERENCES "App_RoutingForms_Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;
