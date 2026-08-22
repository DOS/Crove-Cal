-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecondaryEmail_email_emailVerified_idx" ON "SecondaryEmail"("email", "emailVerified");
