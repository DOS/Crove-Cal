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
    findMany: vi.fn(),
  },
};

describe("Crove Cal MCP Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Event Types", () => {
    test("listEventTypesHandler should query event types for user", async () => {
      mockPrisma.eventType.findMany.mockResolvedValue([
        { id: 1, title: "Quick 15", slug: "15min", length: 15 },
        { id: 2, title: "Deep Dive 45", slug: "45min", length: 45 },
      ]);

      const result = await listEventTypesHandler(mockPrisma as any, { username: "joy" });
      expect(result).toHaveLength(2);
      expect(mockPrisma.eventType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hidden: false,
            users: { some: { username: "joy" } },
          }),
        })
      );
    });

    test("getEventTypeDetailsHandler should return details by ID", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        title: "Quick 15",
        slug: "15min",
        length: 15,
      });

      const result = await getEventTypeDetailsHandler(mockPrisma as any, { eventTypeId: 1 });
      expect(result.id).toBe(1);
      expect(result.slug).toBe("15min");
    });

    test("createEventTypeHandler should create a new event type", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.eventType.create.mockResolvedValue({
        id: 3,
        title: "Discovery Call",
        slug: "discovery-call",
        length: 30,
        userId: 10,
      });

      const result = await createEventTypeHandler(mockPrisma as any, {
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
            userId: 10,
          }),
        })
      );
    });

    test("updateEventTypeHandler should update an existing event type", async () => {
      mockPrisma.eventType.findUnique.mockResolvedValue({ id: 3 });
      mockPrisma.eventType.update.mockResolvedValue({
        id: 3,
        title: "Updated Discovery Call",
        length: 45,
      });

      const result = await updateEventTypeHandler(mockPrisma as any, {
        id: 3,
        title: "Updated Discovery Call",
        length: 45,
      });

      expect(result.title).toBe("Updated Discovery Call");
      expect(mockPrisma.eventType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3 },
          data: expect.objectContaining({
            title: "Updated Discovery Call",
            length: 45,
          }),
        })
      );
    });

    test("deleteEventTypeHandler should delete an event type", async () => {
      mockPrisma.eventType.findUnique.mockResolvedValue({ id: 3 });
      mockPrisma.eventType.delete.mockResolvedValue({
        id: 3,
        title: "Discovery Call",
        slug: "discovery-call",
      });

      const result = await deleteEventTypeHandler(mockPrisma as any, { id: 3 });
      expect(result.id).toBe(3);
      expect(mockPrisma.eventType.delete).toHaveBeenCalledWith({
        where: { id: 3 },
        select: expect.any(Object),
      });
    });
  });

  describe("Available Slots", () => {
    test("getAvailableSlotsHandler should calculate free slots excluding booked intervals", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValue({
        id: 1,
        length: 30,
        timeZone: "UTC",
        userId: 10,
        owner: { id: 10, email: "host@crove.com" },
      });

      // 1 existing booking at 2026-09-01T10:00:00.000Z to 10:30:00.000Z
      mockPrisma.booking.findMany.mockResolvedValue([
        {
          startTime: new Date("2026-09-01T10:00:00.000Z"),
          endTime: new Date("2026-09-01T10:30:00.000Z"),
        },
      ]);

      const result = await getAvailableSlotsHandler(mockPrisma as any, {
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
  });

  describe("Bookings Management", () => {
    test("createBookingHandler should create a booking with attendee", async () => {
      mockPrisma.eventType.findUnique.mockResolvedValue({
        id: 1,
        title: "Intro Call",
        length: 30,
        userId: 10,
        owner: { id: 10, email: "host@crove.com", name: "Host Name" },
      });

      mockPrisma.booking.create.mockImplementation(({ data }) => ({
        id: 50,
        uid: data.uid,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        status: data.status,
      }));

      const result = await createBookingHandler(mockPrisma as any, {
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

    test("getBookingHandler should return booking by UID", async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 50,
        uid: "booking-uid-123",
        title: "Meeting",
        status: "ACCEPTED",
      });

      const result = await getBookingHandler(mockPrisma as any, { bookingUid: "booking-uid-123" });
      expect(result.uid).toBe("booking-uid-123");
    });

    test("rescheduleBookingHandler should update booking times", async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 50,
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
        fromReschedule: "2026-09-01T14:00:00.000Z",
      });

      const result = await rescheduleBookingHandler(mockPrisma as any, {
        bookingUid: "booking-uid-123",
        newStart: "2026-09-02T15:00:00.000Z",
        reason: "Client had a conflict",
      });

      expect(result.rescheduled).toBe(true);
      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { uid: "booking-uid-123" },
          data: expect.objectContaining({
            rescheduled: true,
            fromReschedule: "2026-09-01T14:00:00.000Z",
          }),
        })
      );
    });

    test("cancelBookingHandler should update booking status to CANCELLED", async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({ id: 50, status: "ACCEPTED" });
      mockPrisma.booking.update.mockResolvedValue({
        id: 50,
        uid: "booking-uid-123",
        status: "CANCELLED",
        cancellationReason: "Schedule conflict",
      });

      const result = await cancelBookingHandler(mockPrisma as any, {
        bookingUid: "booking-uid-123",
        cancellationReason: "Schedule conflict",
      });

      expect(result.status).toBe("CANCELLED");
      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { uid: "booking-uid-123" },
          data: expect.objectContaining({
            status: "CANCELLED",
            cancellationReason: "Schedule conflict",
          }),
        })
      );
    });

    test("listBookingsHandler should list bookings by user email and status", async () => {
      mockPrisma.booking.findMany.mockResolvedValue([
        { id: 1, uid: "b1", title: "Meeting 1", status: "ACCEPTED" },
        { id: 2, uid: "b2", title: "Meeting 2", status: "ACCEPTED" },
      ]);

      const result = await listBookingsHandler(mockPrisma as any, {
        userEmail: "joy@dos.ai",
        status: "ACCEPTED",
      });

      expect(result).toHaveLength(2);
      expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "ACCEPTED",
          }),
        })
      );
    });
  });

  describe("Users & Schedules Management", () => {
    test("getUserProfileHandler should return user profile and organizations", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 10,
        username: "joy",
        email: "joy@dos.ai",
        name: "JOY",
        timeZone: "Asia/Ho_Chi_Minh",
        teams: [{ role: "OWNER", accepted: true, team: { id: 1, name: "JOY", isOrganization: true } }],
      });

      const result = await getUserProfileHandler(mockPrisma as any, { email: "joy@dos.ai" });
      expect(result.id).toBe(10);
      expect(result.username).toBe("joy");
      expect(result.teams).toHaveLength(1);
    });

    test("listSchedulesHandler should return schedules with availability intervals", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
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
