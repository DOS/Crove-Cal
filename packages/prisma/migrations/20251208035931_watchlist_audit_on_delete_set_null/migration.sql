-- DropForeignKey
ALTER TABLE "WatchlistAudit" DROP CONSTRAINT "WatchlistAudit_watchlistId_fkey";

-- AlterTable
ALTER TABLE "WatchlistAudit" ALTER COLUMN "watchlistId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "WatchlistAudit" ADD CONSTRAINT "WatchlistAudit_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
