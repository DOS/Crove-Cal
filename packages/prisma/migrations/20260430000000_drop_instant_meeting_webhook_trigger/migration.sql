BEGIN;
UPDATE "Webhook"
SET "eventTriggers" = array_remove("eventTriggers", 'INSTANT_MEETING'::"WebhookTriggerEvents")
WHERE "eventTriggers" @> ARRAY['INSTANT_MEETING']::"WebhookTriggerEvents"[];

CREATE TYPE "WebhookTriggerEvents_new" AS ENUM (
  'BOOKING_CREATED',
  'BOOKING_PAYMENT_INITIATED',
  'BOOKING_PAID',
  'BOOKING_RESCHEDULED',
  'BOOKING_REQUESTED',
  'BOOKING_CANCELLED',
  'BOOKING_REJECTED',
  'BOOKING_NO_SHOW_UPDATED',
  'FORM_SUBMITTED',
  'MEETING_ENDED',
  'MEETING_STARTED',
  'RECORDING_READY',
  'RECORDING_TRANSCRIPTION_GENERATED',
  'OOO_CREATED',
  'AFTER_HOSTS_CAL_VIDEO_NO_SHOW',
  'AFTER_GUESTS_CAL_VIDEO_NO_SHOW',
  'FORM_SUBMITTED_NO_EVENT',
  'DELEGATION_CREDENTIAL_ERROR',
  'WRONG_ASSIGNMENT_REPORT'
);
ALTER TABLE "Webhook"
ALTER COLUMN "eventTriggers" TYPE "WebhookTriggerEvents_new"[]
USING ("eventTriggers"::text::"WebhookTriggerEvents_new"[]);
ALTER TYPE "WebhookTriggerEvents" RENAME TO "WebhookTriggerEvents_old";
ALTER TYPE "WebhookTriggerEvents_new" RENAME TO "WebhookTriggerEvents";
DROP TYPE "WebhookTriggerEvents_old";
COMMIT;
