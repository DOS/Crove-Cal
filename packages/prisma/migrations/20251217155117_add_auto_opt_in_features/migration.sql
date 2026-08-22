-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "autoOptInFeatures" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "autoOptInFeatures" BOOLEAN NOT NULL DEFAULT false;
