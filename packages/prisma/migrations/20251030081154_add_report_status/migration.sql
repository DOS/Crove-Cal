-- CreateEnum
CREATE TYPE "BookingReportStatus" AS ENUM ('PENDING', 'DISMISSED', 'BLOCKED');

-- AlterTable
ALTER TABLE "BookingReport" ADD COLUMN     "status" "BookingReportStatus" NOT NULL DEFAULT 'PENDING';
