-- CreateEnum
CREATE TYPE "OAuthClientType" AS ENUM ('confidential', 'public');

-- AlterTable
ALTER TABLE "AccessCode" ADD COLUMN     "codeChallenge" TEXT,
ADD COLUMN     "codeChallengeMethod" TEXT DEFAULT 'S256';

-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN     "clientType" "OAuthClientType" NOT NULL DEFAULT 'confidential',
ALTER COLUMN "clientSecret" DROP NOT NULL;
