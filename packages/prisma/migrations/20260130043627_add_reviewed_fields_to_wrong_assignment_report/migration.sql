-- AlterTable
ALTER TABLE "WrongAssignmentReport" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" INTEGER;

-- CreateIndex
CREATE INDEX "WrongAssignmentReport_reviewedById_idx" ON "WrongAssignmentReport"("reviewedById");

-- AddForeignKey
ALTER TABLE "WrongAssignmentReport" ADD CONSTRAINT "WrongAssignmentReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
