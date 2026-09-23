import { EventEmitter } from "node:events";

/**
 * Loosely-coupled hook between the booking lifecycle and the workflows engine.
 *
 * The booking services emit domain events; a listener registered by the host app
 * (apps/web/instrumentation.ts) turns them into workflow reminders. This indirection
 * exists so @calcom/features/bookings never imports @calcom/features/workflows -
 * the platform-libraries bundle pulls the booking services and must not drag the
 * whole workflows engine (and its prisma/email graph) into every consumer.
 *
 * Emitting is fire-and-forget: when no listener is registered (platform API
 * consumers, unit tests) the events are simply dropped.
 */
export type BookingWorkflowEvent =
  | {
      type: "booking_confirmed";
      bookingUid: string;
      eventTypeId: number;
      startTime: Date;
      endTime: Date;
    }
  | {
      type: "booking_cancelled";
      bookingUids: string[];
    };

const globalForBookingWorkflowEvents = globalThis as unknown as {
  __croveBookingWorkflowEvents?: EventEmitter;
};

export function getBookingWorkflowEventEmitter(): EventEmitter {
  if (!globalForBookingWorkflowEvents.__croveBookingWorkflowEvents) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalForBookingWorkflowEvents.__croveBookingWorkflowEvents = emitter;
  }
  return globalForBookingWorkflowEvents.__croveBookingWorkflowEvents;
}

export function emitBookingWorkflowEvent(event: BookingWorkflowEvent): void {
  try {
    getBookingWorkflowEventEmitter().emit(event.type, event);
  } catch (error) {
    // Never let a workflow hook break the booking flow.
    console.error("booking-workflow-event:emit-failed", event.type, error);
  }
}
