import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import { WorkflowService } from "./WorkflowService";
import { getBookingWorkflowEventEmitter, type BookingWorkflowEvent } from "@calcom/lib/bookingWorkflowEvents";

const log = logger.getSubLogger({ prefix: ["booking-workflow-listener"] });

async function handleEvent(event: BookingWorkflowEvent): Promise<void> {
  const workflowService = new WorkflowService(prisma);

  if (event.type === "booking_confirmed") {
    await workflowService.scheduleRemindersForBooking({
      bookingUid: event.bookingUid,
      eventTypeId: event.eventTypeId,
      startTime: event.startTime,
      endTime: event.endTime,
    });
    return;
  }

  for (const bookingUid of event.bookingUids) {
    await workflowService.cancelRemindersForBooking({ bookingUid });
  }
}

/**
 * Registers the workflows-side handler for booking lifecycle events. Called once
 * per server process from apps/web/instrumentation.ts (nodejs runtime only).
 */
export function registerBookingWorkflowListener(): void {
  getBookingWorkflowEventEmitter().on(
    "booking_confirmed",
    (event: BookingWorkflowEvent) => {
      handleEvent(event).catch((error) => {
        log.error("booking_confirmed handler failed", error);
      });
    }
  );
  getBookingWorkflowEventEmitter().on(
    "booking_cancelled",
    (event: BookingWorkflowEvent) => {
      handleEvent(event).catch((error) => {
        log.error("booking_cancelled handler failed", error);
      });
    }
  );
  log.debug("Booking workflow listener registered");
}
