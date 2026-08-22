-- CreateEnum
CREATE TYPE "CancellationReasonRequirement" AS ENUM ('MANDATORY_BOTH', 'MANDATORY_HOST_ONLY', 'MANDATORY_ATTENDEE_ONLY', 'OPTIONAL_BOTH');

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "requiresCancellationReason" "CancellationReasonRequirement" DEFAULT 'MANDATORY_HOST_ONLY';
