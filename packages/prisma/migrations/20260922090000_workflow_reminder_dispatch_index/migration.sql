-- Dispatcher query shape: method + scheduled + cancelled + scheduledDate <= now
CREATE INDEX "WorkflowReminder_method_scheduled_cancelled_scheduledDate_idx"
  ON "WorkflowReminder"("method", "scheduled", "cancelled", "scheduledDate");
