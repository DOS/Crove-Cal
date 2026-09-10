-- Indexes for the DOS tenant lookups (MD-05) and the scheduled webhook drain (MD-06).
-- Prisma cannot model jsonb expression indexes, so the two Team expression indexes below
-- are hand-written here only; @@index([isOrganization]) and @@index([startAfter]) are
-- declared in schema.prisma and created below to keep schema and database in sync.

-- CreateIndex
CREATE INDEX "Team_isOrganization_idx" ON "Team"("isOrganization");

-- CreateIndex
CREATE INDEX "Team_dosOrgId_idx" ON "Team" (("metadata"->>'dosOrgId')) WHERE "isOrganization" = true;

-- CreateIndex
CREATE INDEX "Team_dosTeamId_idx" ON "Team" (("metadata"->>'dosTeamId')) WHERE "isOrganization" = false;

-- CreateIndex
CREATE INDEX "WebhookScheduledTriggers_startAfter_idx" ON "WebhookScheduledTriggers"("startAfter");
