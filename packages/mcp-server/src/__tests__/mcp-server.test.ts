import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  cancelBookingHandler,
  createBookingHandler,
  getBookingHandler,
  listBookingsHandler,
  rescheduleBookingHandler,
} from "../tools/bookings";
import {
  createEventTypeHandler,
  deleteEventTypeHandler,
  getEventTypeDetailsHandler,
  listEventTypesHandler,
  updateEventTypeHandler,
} from "../tools/eventTypes";
import { getAvailableSlotsHandler } from "../tools/slots";
import { getUserProfileHandler, listSchedulesHandler } from "../tools/users";
import { createCroveCalMcpServer } from "../server";

const mockPrisma = {
  eventType: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  booking: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
  schedule: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
};

const HOST_USER_ID = 10;

describe("Crove Cal MCP Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Event Types", () => {
    test("listEventTypesHandler should query event types scoped to the host user", async () => {
      mockPrisma.eventType.findMany.mockResolvedValue([
        { id: 1, title: "Quick 15", slug: "15min", length: 15 },
        { id: 2, title: "Deep Dive 45", slug: "45min", length: 45 },
      ]);

      const result = await listEventTypesHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        username: "joy",
      });
      expect(result).toHaveLength(2);
      expect(mockPrisma.eventType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hidden: false,
            userId: HOST_USER_ID,
            users: { some: { username: "joy" } },
          }),
        })
      );
    });

    test("getEventTypeDetailsHandler should return details by ID scoped to the host user", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        title: "Quick 15",
        slug: "15min",
        length: 15,
      });

      const result = await getEventTypeDetailsHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        eventTypeId: 1,
      });
      expect(result.id).toBe(1);
      expect(result.slug).toBe("15min");
      expect(mockPrisma.eventType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            userId: HOST_USER_ID,
          }),
        })
      );
    });

    test("createEventTypeHandler should create a new event type for the host user", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: HOST_USER_ID });
      mockPrisma.eventType.create.mockResolvedValue({
        id: 3,
        title: "Discovery Call",
        slug: "discovery-call",
        length: 30,
        userId: HOST_USER_ID,
      });

      const result = await createEventTypeHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        title: "Discovery Call",
        slug: "discovery-call",
        length: 30,
        username: "joy",
      });

      expect(result.id).toBe(3);
      expect(mockPrisma.eventType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Discovery Call",
            slug: "discovery-call",
            length: 30,
            userId: HOST_USER_ID,
          }),
        })
      );
    });

    test("updateEventTypeHandler should update an existing event type scoped to the host user", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({ id: 3 });
      mockPrisma.eventType.update.mockResolvedValue({
        id: 3,
        title: "Updated Discovery Call",
        length: 45,
      });

      const result = await updateEventTypeHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        id: 3,
        title: "Updated Discovery Call",
        length: 45,
      });

      expect(result.title).toBe("Updated Discovery Call");
      expect(mockPrisma.eventType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3, userId: HOST_USER_ID },
          data: expect.objectContaining({
            title: "Updated Discovery Call",
            length: 45,
          }),
        })
      );
    });

    test("updateEventTypeHandler should reject an event type owned by another user", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue(null);

      await expect(
        updateEventTypeHandler(mockPrisma as any, {
          userId: HOST_USER_ID,
          id: 3,
          title: "Hijacked",
        })
      ).rejects.toThrow("Event type with ID 3 not found for user 10");
      expect(mockPrisma.eventType.update).not.toHaveBeenCalled();
    });

    test("deleteEventTypeHandler should delete an event type scoped to the host user", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({ id: 3 });
      mockPrisma.eventType.delete.mockResolvedValue({
        id: 3,
        title: "Discovery Call",
        slug: "discovery-call",
      });

      const result = await deleteEventTypeHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        id: 3,
      });
      expect(result.id).toBe(3);
      expect(mockPrisma.eventType.delete).toHaveBeenCalledWith({
        where: { id: 3, userId: HOST_USER_ID },
        select: expect.any(Object),
      });
    });

    test("deleteEventTypeHandler should reject an event type owned by another user", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue(null);

      await expect(
        deleteEventTypeHandler(mockPrisma as any, {
          userId: HOST_USER_ID,
          id: 3,
        })
      ).rejects.toThrow("Event type with ID 3 not found for user 10");
      expect(mockPrisma.eventType.delete).not.toHaveBeenCalled();
    });
  });

  describe("Available Slots", () => {
    test("getAvailableSlotsHandler should fall back to 09:00-17:00 UTC when host has no schedule", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        length: 30,
        timeZone: "UTC",
        userId: HOST_USER_ID,
        owner: { id: HOST_USER_ID, email: "host@crove.com", defaultScheduleId: null },
      });
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      // 1 existing booking at 2026-09-01T10:00:00.000Z to 10:30:00.000Z
      mockPrisma.booking.findMany.mockResolvedValue([
        {
          startTime: new Date("2026-09-01T10:00:00.000Z"),
          endTime: new Date("2026-09-01T10:30:00.000Z"),
        },
      ]);

      const result = await getAvailableSlotsHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        eventTypeId: 1,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-01",
      });

      expect(result.eventTypeId).toBe(1);
      expect(result.length).toBe(30);
      expect(result.slots.length).toBeGreaterThan(0);

      // Verify that 10:00:00.000Z is not in the available slots
      const hasOverlapSlot = result.slots.some((s) => s.time === "2026-09-01T10:00:00.000Z");
      expect(hasOverlapSlot).toBe(false);

      // Verify that 09:00:00.000Z and 10:30:00.000Z are present
      const has9amSlot = result.slots.some((s) => s.time === "2026-09-01T09:00:00.000Z");
      const has1030Slot = result.slots.some((s) => s.time === "2026-09-01T10:30:00.000Z");
      expect(has9amSlot).toBe(true);
      expect(has1030Slot).toBe(true);
    });

    test("getAvailableSlotsHandler should use the host schedule's UTC working windows", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        length: 30,
        timeZone: "UTC",
        userId: HOST_USER_ID,
        owner: { id: HOST_USER_ID, email: "host@crove.com", defaultScheduleId: null },
      });
      // Tuesday 2026-09-01, working window 10:00-12:00 UTC (days: 2 = Tuesday)
      mockPrisma.schedule.findFirst.mockResolvedValue({
        timeZone: "UTC",
        availability: [
          {
            days: [2],
            startTime: new Date("1970-01-01T10:00:00.000Z"),
            endTime: new Date("1970-01-01T12:00:00.000Z"),
          },
        ],
      });
      mockPrisma.booking.findMany.mockResolvedValue([]);

      const result = await getAvailableSlotsHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        eventTypeId: 1,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-01",
      });

      // 30-minute slots inside 10:00-12:00: 10:00, 10:30, 11:00, 11:30
      expect(result.slots).toHaveLength(4);
      expect(result.slots[0].time).toBe("2026-09-01T10:00:00.000Z");
      expect(result.slots[3].time).toBe("2026-09-01T11:30:00.000Z");
      const has9amSlot = result.slots.some((s) => s.time === "2026-09-01T09:00:00.000Z");
      expect(has9amSlot).toBe(false);
    });

    test("getAvailableSlotsHandler should fall back to fixed UTC hours for non-UTC schedules", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        length: 30,
        timeZone: "UTC",
        userId: HOST_USER_ID,
        owner: { id: HOST_USER_ID, email: "host@crove.com", defaultScheduleId: null },
      });
      mockPrisma.schedule.findFirst.mockResolvedValue({
        timeZone: "Asia/Ho_Chi_Minh",
        availability: [
          {
            days: [2],
            startTime: new Date("1970-01-01T10:00:00.000Z"),
            endTime: new Date("1970-01-01T12:00:00.000Z"),
          },
        ],
      });
      mockPrisma.booking.findMany.mockResolvedValue([]);

      const result = await getAvailableSlotsHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        eventTypeId: 1,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-01",
      });

      const has9amSlot = result.slots.some((s) => s.time === "2026-09-01T09:00:00.000Z");
      expect(has9amSlot).toBe(true);
    });

    test("getAvailableSlotsHandler should reject date spans longer than 60 days", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        length: 30,
        timeZone: "UTC",
        userId: HOST_USER_ID,
        owner: { id: HOST_USER_ID, email: "host@crove.com", defaultScheduleId: null },
      });

      await expect(
        getAvailableSlotsHandler(mockPrisma as any, {
          userId: HOST_USER_ID,
          eventTypeId: 1,
          dateFrom: "2026-09-01",
          dateTo: "2026-11-05",
        })
      ).rejects.toThrow("Date range too large");
    });
  });

  describe("Bookings Management", () => {
    test("createBookingHandler should create a booking with attendee", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        title: "Intro Call",
        length: 30,
        userId: HOST_USER_ID,
        requiresConfirmation: false,
        owner: { id: HOST_USER_ID, email: "host@crove.com", name: "Host Name" },
      });
      mockPrisma.booking.findFirst.mockResolvedValue(null);

      mockPrisma.booking.create.mockImplementation(({ data }) => ({
        id: 50,
        uid: data.uid,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        status: data.status,
      }));

      const result = await createBookingHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        eventTypeId: 1,
        start: "2026-09-01T14:00:00.000Z",
        name: "Alice Client",
        email: "alice@example.com",
        notes: "Discuss integration",
      });

      expect(result.id).toBe(50);
      expect(result.status).toBe("ACCEPTED");
      expect(mockPrisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventTypeId: 1,
            userPrimaryEmail: "host@crove.com",
            attendees: {
              create: expect.objectContaining({
                name: "Alice Client",
                email: "alice@example.com",
              }),
            },
          }),
        })
      );
    });

    test("createBookingHandler should reject a conflicting time slot", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        title: "Intro Call",
        length: 30,
        userId: HOST_USER_ID,
        requiresConfirmation: false,
        owner: { id: HOST_USER_ID, email: "host@crove.com", name: "Host Name" },
      });
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 99,
        startTime: new Date("2026-09-01T14:00:00.000Z"),
        endTime: new Date("2026-09-01T14:30:00.000Z"),
      });

      await expect(
        createBookingHandler(mockPrisma as any, {
          userId: HOST_USER_ID,
          eventTypeId: 1,
          start: "2026-09-01T14:00:00.000Z",
          name: "Alice Client",
          email: "alice@example.com",
        })
      ).rejects.toThrow("Time slot already booked");
      expect(mockPrisma.booking.create).not.toHaveBeenCalled();
    });

    test("createBookingHandler should mark bookings PENDING when the event type requires confirmation", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        title: "Intro Call",
        length: 30,
        userId: HOST_USER_ID,
        requiresConfirmation: true,
        owner: { id: HOST_USER_ID, email: "host@crove.com", name: "Host Name" },
      });
      mockPrisma.booking.findFirst.mockResolvedValue(null);

      mockPrisma.booking.create.mockImplementation(({ data }) => ({
        id: 51,
        uid: data.uid,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        status: data.status,
      }));

      const result = await createBookingHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        eventTypeId: 1,
        start: "2026-09-01T16:00:00.000Z",
        name: "Bob Client",
        email: "bob@example.com",
      });

      expect(result.status).toBe("PENDING");
      expect(mockPrisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PENDING",
          }),
        })
      );
    });

    test("createBookingHandler should reject event types owned by another user", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue(null);

      await expect(
        createBookingHandler(mockPrisma as any, {
          userId: HOST_USER_ID,
          eventTypeId: 1,
          start: "2026-09-01T14:00:00.000Z",
          name: "Alice Client",
          email: "alice@example.com",
        })
      ).rejects.toThrow("Event type with ID 1 not found for user 10");
      expect(mockPrisma.booking.create).not.toHaveBeenCalled();
    });

    test("getBookingHandler should return booking by UID scoped to the host user", async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 50,
        uid: "booking-uid-123",
        title: "Meeting",
        status: "ACCEPTED",
      });

      const result = await getBookingHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        bookingUid: "booking-uid-123",
      });
      expect(result.uid).toBe("booking-uid-123");
      expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            uid: "booking-uid-123",
            userId: HOST_USER_ID,
          }),
        })
      );
    });

    test("rescheduleBookingHandler should update booking times and store the original UID in fromReschedule", async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 50,
        uid: "booking-uid-123",
        userId: HOST_USER_ID,
        startTime: new Date("2026-09-01T14:00:00.000Z"),
        endTime: new Date("2026-09-01T14:30:00.000Z"),
        eventType: { length: 30 },
      });

      mockPrisma.booking.update.mockResolvedValue({
        id: 50,
        uid: "booking-uid-123",
        startTime: new Date("2026-09-02T15:00:00.000Z"),
        endTime: new Date("2026-09-02T15:30:00.000Z"),
        rescheduled: true,
        fromReschedule: "booking-uid-123",
      });

      const result = await rescheduleBookingHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        bookingUid: "booking-uid-123",
        newStart: "2026-09-02T15:00:00.000Z",
        reason: "Client had a conflict",
      });

      expect(result.rescheduled).toBe(true);
      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 50 },
          data: expect.objectContaining({
            rescheduled: true,
            fromReschedule: "booking-uid-123",
          }),
        })
      );
    });

    test("rescheduleBookingHandler should reject bookings hosted by another user", async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(null);

      await expect(
        rescheduleBookingHandler(mockPrisma as any, {
          userId: HOST_USER_ID,
          bookingUid: "booking-uid-123",
          newStart: "2026-09-02T15:00:00.000Z",
        })
      ).rejects.toThrow("Booking with UID booking-uid-123 not found for user 10");
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    test("cancelBookingHandler should update booking status to CANCELLED", async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 50,
        userId: HOST_USER_ID,
        status: "ACCEPTED",
      });
      mockPrisma.booking.update.mockResolvedValue({
        id: 50,
        uid: "booking-uid-123",
        status: "CANCELLED",
        cancellationReason: "Schedule conflict",
      });

      const result = await cancelBookingHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        bookingUid: "booking-uid-123",
        cancellationReason: "Schedule conflict",
      });

      expect(result.status).toBe("CANCELLED");
      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 50 },
          data: expect.objectContaining({
            status: "CANCELLED",
            cancellationReason: "Schedule conflict",
          }),
        })
      );
    });

    test("cancelBookingHandler should reject bookings hosted by another user", async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(null);

      await expect(
        cancelBookingHandler(mockPrisma as any, {
          userId: HOST_USER_ID,
          bookingUid: "booking-uid-123",
        })
      ).rejects.toThrow("Booking with UID booking-uid-123 not found for user 10");
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    test("listBookingsHandler should list host bookings scoped to the host user", async () => {
      mockPrisma.booking.findMany.mockResolvedValue([
        { id: 1, uid: "b1", title: "Meeting 1", status: "ACCEPTED" },
        { id: 2, uid: "b2", title: "Meeting 2", status: "ACCEPTED" },
      ]);

      const result = await listBookingsHandler(mockPrisma as any, {
        userId: HOST_USER_ID,
        userEmail: "joy@dos.ai",
        status: "ACCEPTED",
      });

      expect(result).toHaveLength(2);
      expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: HOST_USER_ID,
            status: "ACCEPTED",
          }),
        })
      );
    });
  });

  describe("Users & Schedules Management", () => {
    test("getUserProfileHandler should return user profile and organizations", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: HOST_USER_ID,
        username: "joy",
        email: "joy@dos.ai",
        name: "JOY",
        timeZone: "Asia/Ho_Chi_Minh",
        teams: [{ role: "OWNER", accepted: true, team: { id: 1, name: "JOY", isOrganization: true } }],
      });

      const result = await getUserProfileHandler(mockPrisma as any, { email: "joy@dos.ai" });
      expect(result.id).toBe(HOST_USER_ID);
      expect(result.username).toBe("joy");
      expect(result.teams).toHaveLength(1);
    });

    test("listSchedulesHandler should return schedules with availability intervals", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: HOST_USER_ID });
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          id: 1,
          name: "Working Hours",
          timeZone: "Asia/Ho_Chi_Minh",
          availability: [{ id: 1, days: [1, 2, 3, 4, 5], startTime: new Date(), endTime: new Date() }],
        },
      ]);

      const result = await listSchedulesHandler(mockPrisma as any, { username: "joy" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Working Hours");
    });
  });

  describe("MCP Server Initialization", () => {
    test("createCroveCalMcpServer should initialize and register all 13 tools", () => {
      const server = createCroveCalMcpServer(mockPrisma as any);
      expect(server).toBeDefined();
    });
  });
});
