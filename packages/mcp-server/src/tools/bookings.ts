import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

export interface CreateBookingInput {
  /** Host user ID (tenant scope) — the event type must belong to this host */
  userId: number;
  eventTypeId: number;
  start: string; // ISO 8601 string
  name: string;
  email: string;
  timeZone?: string;
  notes?: string;
  location?: string;
}

export async function createBookingHandler(prisma: PrismaClient, input: CreateBookingInput) {
  const eventType = await prisma.eventType.findFirst({
    where: { id: input.eventTypeId, userId: input.userId },
    select: {
      id: true,
      title: true,
      length: true,
      userId: true,
      requiresConfirmation: true,
      owner: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!eventType) {
    throw new Error(`Event type with ID ${input.eventTypeId} not found for user ${input.userId}`);
  }

  const startTime = new Date(input.start);
  if (Number.isNaN(startTime.getTime())) {
    throw new Error("Invalid start time format. Please provide a valid ISO 8601 date string.");
  }

  const endTime = new Date(startTime.getTime() + eventType.length * 60 * 1000);

  // Minimal overlap guard for ACCEPTED/PENDING bookings of this event type.
  const conflict = await prisma.booking.findFirst({
    where: {
      eventTypeId: eventType.id,
      status: { in: ["ACCEPTED", "PENDING"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
    },
  });

  if (conflict) {
    throw new Error(
      `Time slot already booked: ${conflict.startTime.toISOString()} - ${conflict.endTime.toISOString()}`
    );
  }

  // Why: this write bypasses the full booking pipeline in
  // packages/features/bookings/lib/handleNewBooking (availability calculation, calendar
  // invites, webhook triggers, workflow reminders) — MCP-created bookings send NO calendar
  // invitation and fire NO host webhooks. The conflict guard above and the
  // requiresConfirmation status handling below are minimal guards, not a replacement for
  // that pipeline.
  const uid = randomUUID();

  const booking = await prisma.booking.create({
    data: {
      uid,
      title: `${eventType.title} between ${eventType.owner?.name || "Host"} and ${input.name}`,
      startTime,
      endTime,
      description: input.notes || null,
      location: input.location || "Cal Video",
      eventTypeId: eventType.id,
      userId: eventType.userId || eventType.owner?.id,
      userPrimaryEmail: eventType.owner?.email,
      status: eventType.requiresConfirmation ? "PENDING" : "ACCEPTED",
      attendees: {
        create: {
          name: input.name,
          email: input.email.toLowerCase(),
          timeZone: input.timeZone || "UTC",
        },
      },
    },
    select: {
      id: true,
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      location: true,
      status: true,
      description: true,
      attendees: {
        select: {
          name: true,
          email: true,
          timeZone: true,
        },
      },
    },
  });

  return booking;
}

export interface GetBookingInput {
  /** Host user ID (tenant scope) — only bookings hosted by this user are returned */
  userId: number;
  bookingUid?: string;
  bookingId?: number;
}

export async function getBookingHandler(prisma: PrismaClient, input: GetBookingInput) {
  if (!input.bookingUid && !input.bookingId) {
    throw new Error("Either bookingUid or bookingId must be provided");
  }

  const where: Prisma.BookingWhereInput = {
    userId: input.userId,
  };
  if (input.bookingUid) {
    where.uid = input.bookingUid;
  } else if (input.bookingId) {
    where.id = input.bookingId;
  }

  const booking = await prisma.booking.findFirst({
    where,
    select: {
      id: true,
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      location: true,
      status: true,
      description: true,
      cancellationReason: true,
      cancelledBy: true,
      rescheduled: true,
      fromReschedule: true,
      attendees: {
        select: {
          name: true,
          email: true,
          timeZone: true,
        },
      },
      eventType: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
  });

  if (!booking) {
    throw new Error("Booking not found");
  }

  return booking;
}

export interface RescheduleBookingInput {
  /** Host user ID (tenant scope) — only bookings hosted by this user can be rescheduled */
  userId: number;
  bookingUid: string;
  newStart: string; // ISO 8601 string
  reason?: string;
  rescheduledBy?: string;
}

export async function rescheduleBookingHandler(prisma: PrismaClient, input: RescheduleBookingInput) {
  const existing = await prisma.booking.findFirst({
    where: { uid: input.bookingUid, userId: input.userId },
    select: {
      id: true,
      uid: true,
      userId: true,
      startTime: true,
      endTime: true,
      eventType: {
        select: { length: true },
      },
    },
  });

  if (!existing) {
    throw new Error(`Booking with UID ${input.bookingUid} not found for user ${input.userId}`);
  }

  const newStartTime = new Date(input.newStart);
  if (Number.isNaN(newStartTime.getTime())) {
    throw new Error("Invalid newStart format. Please provide a valid ISO 8601 date string.");
  }

  const durationMs = existing.eventType
    ? existing.eventType.length * 60 * 1000
    : existing.endTime.getTime() - existing.startTime.getTime();

  const newEndTime = new Date(newStartTime.getTime() + durationMs);

  const updated = await prisma.booking.update({
    where: { id: existing.id },
    data: {
      startTime: newStartTime,
      endTime: newEndTime,
      rescheduled: true,
      // Why: fromReschedule semantically holds the ORIGINAL booking's UID (every other writer
      // stores booking.uid — see BookingRepository.findPreviousBooking), not a timestamp.
      fromReschedule: existing.uid,
      rescheduledBy: input.rescheduledBy || "AI Agent",
      status: "ACCEPTED",
    },
    select: {
      id: true,
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      rescheduled: true,
      fromReschedule: true,
    },
  });

  return updated;
}

export interface CancelBookingInput {
  /** Host user ID (tenant scope) — only bookings hosted by this user can be cancelled */
  userId: number;
  bookingUid: string;
  cancellationReason?: string;
  cancelledBy?: string;
}

export async function cancelBookingHandler(prisma: PrismaClient, input: CancelBookingInput) {
  const existing = await prisma.booking.findFirst({
    where: { uid: input.bookingUid, userId: input.userId },
    select: { id: true, userId: true, status: true },
  });

  if (!existing) {
    throw new Error(`Booking with UID ${input.bookingUid} not found for user ${input.userId}`);
  }

  const cancelled = await prisma.booking.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      cancellationReason: input.cancellationReason || "Cancelled via AI Agent",
      cancelledBy: input.cancelledBy || "AI Agent",
    },
    select: {
      id: true,
      uid: true,
      title: true,
      status: true,
      cancellationReason: true,
      cancelledBy: true,
    },
  });

  return cancelled;
}

export interface ListBookingsInput {
  /** Host user ID (tenant scope) — only bookings hosted by this user are listed */
  userId: number;
  userEmail?: string;
  status?: "ACCEPTED" | "CANCELLED" | "PENDING" | "REJECTED";
  limit?: number;
}

export async function listBookingsHandler(prisma: PrismaClient, input: ListBookingsInput) {
  const where: Prisma.BookingWhereInput = {
    userId: input.userId,
  };

  if (input.status) {
    where.status = input.status;
  }

  if (input.userEmail) {
    where.OR = [
      { userPrimaryEmail: { equals: input.userEmail, mode: "insensitive" } },
      { attendees: { some: { email: { equals: input.userEmail, mode: "insensitive" } } } },
    ];
  }

  const bookings = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      location: true,
      attendees: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      startTime: "desc",
    },
    take: input.limit || 20,
  });

  return bookings;
}
