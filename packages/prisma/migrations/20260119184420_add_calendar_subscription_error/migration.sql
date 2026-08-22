-- AlterTable
ALTER TABLE "SelectedCalendar"
    ADD COLUMN "syncSubscribedErrorAt" TIMESTAMP(3),
    ADD COLUMN "syncSubscribedErrorCount" INTEGER NOT NULL DEFAULT 0;
