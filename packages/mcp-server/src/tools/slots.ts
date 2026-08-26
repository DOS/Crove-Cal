import type { PrismaClient } from "@calcom/prisma";

export interface GetAvailableSlotsInput {
  eventTypeId?: number;
  slug?: string;
  username?: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  timeZone?: string;
}

export interface TimeSlot {
  time: string; // ISO 8601 string
}

export async function getAvailableSlotsHandler(prisma: PrismaClient, input: GetAvailableSlotsInput) {
  if (!input.eventTypeId && !input.slug) {
    throw new Error("Either eventTypeId or slug must be provided");
  }

  const where: Parameters<typeof prisma.eventType.findFirst>[0]["where"] = {};
  if (input.eventTypeId) {
    where.id = input.eventTypeId;
  } else if (input.slug) {
    where.slug = input.slug;
    if (input.username) {
      where.users = { some: { username: input.username } };
    }
  }

  const eventType = await prisma.eventType.findFirst({
    where,
    select: {
      id: true,
      length: true,
      timeZone: true,
      userId: true,
      owner: {
        select: {
          id: true,
          email: true,
          defaultScheduleId: true,
        },
      },
    },
  });

  if (!eventType) {
    throw new Error("Event type not found");
  }

  const startDate = new Date(`${input.dateFrom}T00:00:00.000Z`);
  const endDate = new Date(`${input.dateTo}T23:59:59.999Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid dateFrom or dateTo format. Please use YYYY-MM-DD");
  }

  // Get existing non-cancelled bookings in the date range
  const existingBookings = await prisma.booking.findMany({
    where: {
      eventTypeId: eventType.id,
      status: { notIn: ["CANCELLED", "REJECTED"] },
      startTime: { lte: endDate },
      endTime: { gte: startDate },
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });

  const bookedIntervals = existingBookings.map((b) => ({
    start: new Date(b.startTime).getTime(),
    end: new Date(b.endTime).getTime(),
  }));

  const durationMs = eventType.length * 60 * 1000;
  const slots: TimeSlot[] = [];

  // Generate candidate slots per day between 09:00 and 17:00 UTC (or local working window)
  const currentDay = new Date(startDate);
  while (currentDay <= endDate) {
    // Generate slots for working hours 09:00 - 17:00
    const dayStart = new Date(currentDay);
    dayStart.setUTCHours(9, 0, 0, 0);

    const dayEnd = new Date(currentDay);
    dayEnd.setUTCHours(17, 0, 0, 0);

    let slotStart = dayStart.getTime();
    while (slotStart + durationMs <= dayEnd.getTime()) {
      const slotEnd = slotStart + durationMs;

      // Check if slot overlaps with any booked intervals
      const isOverlap = bookedIntervals.some((b) => slotStart < b.end && slotEnd > b.start);

      if (!isOverlap && slotStart > Date.now()) {
        slots.push({
          time: new Date(slotStart).toISOString(),
        });
      }

      slotStart += durationMs;
    }

    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }

  return {
    eventTypeId: eventType.id,
    length: eventType.length,
    slots,
  };
}
