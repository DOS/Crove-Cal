-- CreateEnum
CREATE TYPE "SystemReportStatus" AS ENUM ('PENDING', 'BLOCKED', 'DISMISSED');

-- AlterTable
ALTER TABLE "BookingReport" ADD COLUMN     "globalWatchlistId" UUID,
ADD COLUMN     "systemStatus" "SystemReportStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "BookingReport_globalWatchlistId_idx" ON "BookingReport"("globalWatchlistId");

-- CreateIndex
CREATE INDEX "BookingReport_systemStatus_idx" ON "BookingReport"("systemStatus");

-- AddForeignKey
ALTER TABLE "BookingReport" ADD CONSTRAINT "BookingReport_globalWatchlistId_fkey" FOREIGN KEY ("globalWatchlistId") REFERENCES "Watchlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
