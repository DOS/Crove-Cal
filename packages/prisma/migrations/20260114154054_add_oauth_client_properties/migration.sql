-- CreateEnum
CREATE TYPE "OAuthClientStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "OAuthClientStatus" NOT NULL DEFAULT 'approved',
ADD COLUMN     "userId" INTEGER,
ADD COLUMN     "websiteUrl" TEXT;

-- CreateIndex
CREATE INDEX "OAuthClient_userId_idx" ON "OAuthClient"("userId");

-- AddForeignKey
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
