-- DropIndex
DROP INDEX "Watchlist_type_value_organizationId_action_idx";

-- CreateIndex
CREATE INDEX "Watchlist_isGlobal_action_organizationId_type_value_idx" ON "Watchlist"("isGlobal", "action", "organizationId", "type", "value");
