-- AlterTable: Add enabled column with DEFAULT true so existing rows get enabled=true
ALTER TABLE "TeamFeatures" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Add enabled column with DEFAULT true so existing rows get enabled=true
ALTER TABLE "UserFeatures" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

-- Remove the DEFAULT constraint so new rows must explicitly set enabled
ALTER TABLE "TeamFeatures" ALTER COLUMN "enabled" DROP DEFAULT;
ALTER TABLE "UserFeatures" ALTER COLUMN "enabled" DROP DEFAULT;
