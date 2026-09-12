import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

export interface GetAvailableSlotsInput {
  /** Host user ID (tenant scope) — availability is computed for this host */
  userId: number;
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_DATE_RANGE_DAYS = 60;

export async function getAvailableSlotsHandler(prisma: PrismaClient, input: GetAvailableSlotsInput) {
  if (!input.eventTypeId && !input.slug) {
    throw new Error("Either eventTypeId or slug must be provided");
  }

  const where: Prisma.EventTypeWhereInput = {
    userId: input.userId,
  };
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

  const hostUserId = eventType.userId ?? eventType.owner?.id;
  if (!hostUserId) {
    throw new Error(
      `Event type with ID ${eventType.id} has no owning user, so host availability cannot be determined`
    );
  }

  const startDate = new Date(`${input.dateFrom}T00:00:00.000Z`);
  const endDate = new Date(`${input.dateTo}T23:59:59.999Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid dateFrom or dateTo format. Please use YYYY-MM-DD");
  }

  const spanDays = Math.round(
    (new Date(`${input.dateTo}T00:00:00.000Z`).getTime() -
      new Date(`${input.dateFrom}T00:00:00.000Z`).getTime()) /
      MS_PER_DAY
  );
  if (spanDays > MAX_DATE_RANGE_DAYS) {
    throw new Error(
      `Date range too large: dateFrom to dateTo spans ${spanDays} days, maximum is ${MAX_DATE_RANGE_DAYS}`
    );
  }

  const schedule = await prisma.schedule.findFirst({
    where: { userId: hostUserId },
    select: {
      timeZone: true,
      availability: {
        select: {
          days: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  // Availability windows are only used when the schedule is in UTC — converting non-UTC
  // windows would require DST-aware timezone math that is out of scope here.
  const scheduleHasUtcWindows = Boolean(
    schedule && (schedule.timeZone === "UTC" || schedule.timeZone === "Etc/UTC")
  );

  // Get the host's non-cancelled bookings in the date range (across ALL of their event
  // types, not just the requested one — the host cannot attend two meetings at once).
  const existingBookings = await prisma.booking.findMany({
    where: {
      userId: hostUserId,
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

  // Generate candidate slots per day inside the host's working windows
  const currentDay = new Date(startDate);
  while (currentDay <= endDate) {
    const dayStart = new Date(currentDay);
    dayStart.setUTCHours(0, 0, 0, 0);

    const dayWindows: Array<{ start: number; end: number }> = [];

    if (scheduleHasUtcWindows && schedule) {
      // Cal.com availability.days uses the JS convention: 0 = Sunday ... 6 = Saturday.
      const dayOfWeek = dayStart.getUTCDay();
      for (const availabilityRow of schedule.availability) {
        if (!availabilityRow.days.includes(dayOfWeek)) {
          continue;
        }
        // Time columns come back anchored to 1970-01-01, but derive offsets from the
        // clock fields so the math does not depend on that anchor.
        const windowStart =
          dayStart.getTime() +
          availabilityRow.startTime.getUTCHours() * 3_600_000 +
          availabilityRow.startTime.getUTCMinutes() * 60_000;
        const windowEnd =
          dayStart.getTime() +
          availabilityRow.endTime.getUTCHours() * 3_600_000 +
          availabilityRow.endTime.getUTCMinutes() * 60_000;
        if (windowEnd > windowStart) {
          dayWindows.push({ start: windowStart, end: windowEnd });
        }
      }
    } else {
      // Why: the host has no schedule (or it is not UTC-based); converting a non-UTC
      // schedule's windows would need full timezone/DST handling, so fall back to a
      // fixed 09:00-17:00 UTC working window to keep slot generation deterministic.
      const fallbackStart = new Date(dayStart);
      fallbackStart.setUTCHours(9, 0, 0, 0);
      const fallbackEnd = new Date(dayStart);
      fallbackEnd.setUTCHours(17, 0, 0, 0);
      dayWindows.push({ start: fallbackStart.getTime(), end: fallbackEnd.getTime() });
    }

    for (const window of dayWindows) {
      let slotStart = window.start;
      while (slotStart + durationMs <= window.end) {
        const slotEnd = slotStart + durationMs;

        // Check if slot overlaps with any booked intervals
        const isOverlap = bookedIntervals.some((b) => slotStart < b.end && slotEnd > b.start);

        if (!isOverlap) {
          slots.push({
            time: new Date(slotStart).toISOString(),
          });
        }

        slotStart += durationMs;
      }
    }

    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }

  return {
    eventTypeId: eventType.id,
    length: eventType.length,
    slots,
  };
}
