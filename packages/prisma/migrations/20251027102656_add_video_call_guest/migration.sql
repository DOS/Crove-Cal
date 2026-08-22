-- AlterTable
ALTER TABLE "CalVideoSettings" ADD COLUMN     "requireEmailForGuests" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VideoCallGuest" (
    "id" TEXT NOT NULL,
    "bookingUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCallGuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoCallGuest_bookingUid_idx" ON "VideoCallGuest"("bookingUid");

-- CreateIndex
CREATE INDEX "VideoCallGuest_email_idx" ON "VideoCallGuest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCallGuest_bookingUid_email_key" ON "VideoCallGuest"("bookingUid", "email");
