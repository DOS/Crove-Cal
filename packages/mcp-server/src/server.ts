import type { PrismaClient } from "@calcom/prisma";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  cancelBookingHandler,
  createBookingHandler,
  getBookingHandler,
  listBookingsHandler,
  rescheduleBookingHandler,
} from "./tools/bookings";
import {
  createEventTypeHandler,
  deleteEventTypeHandler,
  getEventTypeDetailsHandler,
  listEventTypesHandler,
  updateEventTypeHandler,
} from "./tools/eventTypes";
import { getAvailableSlotsHandler } from "./tools/slots";
import { getUserProfileHandler, listSchedulesHandler } from "./tools/users";

export function createCroveCalMcpServer(prisma: PrismaClient) {
  const server = new McpServer({
    name: "crove-cal-mcp",
    version: "2.0.0",
  });

  // Tool 1: list_event_types
  server.registerTool(
    "crove_cal_list_event_types",
    {
      title: "List Event Types",
      description: "List available meeting and booking event types for a user or organization in Crove Cal.",
      inputSchema: {
        username: z.string().optional().describe("Username of the host (e.g., 'joy')"),
        orgSlug: z.string().optional().describe("Organization slug (e.g., 'crove')"),
        userId: z.number().optional().describe("User ID of the host"),
        limit: z.number().optional().describe("Maximum number of event types to return (default 50)"),
      },
    },
    async (args) => {
      try {
        const result = await listEventTypesHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing event types: ${message}` }],
        };
      }
    }
  );

  // Tool 2: get_event_type
  server.registerTool(
    "crove_cal_get_event_type",
    {
      title: "Get Event Type Details",
      description: "Get detailed information about a specific event type by ID or slug.",
      inputSchema: {
        eventTypeId: z.number().optional().describe("Event Type ID"),
        slug: z.string().optional().describe("Event Type Slug (e.g., '30min')"),
        username: z.string().optional().describe("Username of the host if slug is provided"),
      },
    },
    async (args) => {
      try {
        const result = await getEventTypeDetailsHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching event type: ${message}` }],
        };
      }
    }
  );

  // Tool 3: create_event_type
  server.registerTool(
    "crove_cal_create_event_type",
    {
      title: "Create Event Type",
      description: "Create a new meeting/booking event type (e.g., 15min Discovery, 45min Demo).",
      inputSchema: {
        title: z.string().describe("Title of the event type (e.g., 'Discovery Call')"),
        slug: z.string().describe("Unique URL slug (e.g., 'discovery-call')"),
        length: z.number().describe("Duration of the meeting in minutes (e.g., 30)"),
        description: z.string().optional().describe("Description shown to attendees"),
        username: z.string().optional().describe("Username of the host"),
        userId: z.number().optional().describe("User ID of the host"),
        requiresConfirmation: z.boolean().optional().describe("Whether host must manually approve bookings"),
      },
    },
    async (args) => {
      try {
        const result = await createEventTypeHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error creating event type: ${message}` }],
        };
      }
    }
  );

  // Tool 4: update_event_type
  server.registerTool(
    "crove_cal_update_event_type",
    {
      title: "Update Event Type",
      description:
        "Update title, duration, description, or confirmation settings for an existing event type.",
      inputSchema: {
        id: z.number().describe("Event Type numeric ID"),
        title: z.string().optional().describe("New title"),
        slug: z.string().optional().describe("New slug"),
        length: z.number().optional().describe("New duration in minutes"),
        description: z.string().optional().describe("New description"),
        requiresConfirmation: z.boolean().optional().describe("Update confirmation approval flag"),
        hidden: z.boolean().optional().describe("Whether to hide event type from public profile"),
      },
    },
    async (args) => {
      try {
        const result = await updateEventTypeHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error updating event type: ${message}` }],
        };
      }
    }
  );

  // Tool 5: delete_event_type
  server.registerTool(
    "crove_cal_delete_event_type",
    {
      title: "Delete Event Type",
      description: "Delete an event type by ID.",
      inputSchema: {
        id: z.number().describe("Event Type numeric ID to delete"),
      },
    },
    async (args) => {
      try {
        const result = await deleteEventTypeHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error deleting event type: ${message}` }],
        };
      }
    }
  );

  // Tool 6: get_available_slots
  server.registerTool(
    "crove_cal_get_available_slots",
    {
      title: "Get Available Slots",
      description:
        "Retrieve bookable time slots for an event type between two dates (calculating host availability minus booked meetings).",
      inputSchema: {
        eventTypeId: z.number().optional().describe("Event Type ID"),
        slug: z.string().optional().describe("Event Type Slug (e.g., '30min')"),
        username: z.string().optional().describe("Host username if slug is used"),
        dateFrom: z.string().describe("Start date in YYYY-MM-DD format"),
        dateTo: z.string().describe("End date in YYYY-MM-DD format"),
        timeZone: z.string().optional().describe("Timezone (e.g., 'Asia/Ho_Chi_Minh' or 'UTC')"),
      },
    },
    async (args) => {
      try {
        const result = await getAvailableSlotsHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error calculating available slots: ${message}` }],
        };
      }
    }
  );

  // Tool 7: create_booking
  server.registerTool(
    "crove_cal_create_booking",
    {
      title: "Create Booking",
      description: "Schedule a new booking/meeting in Crove Cal with attendee information.",
      inputSchema: {
        eventTypeId: z.number().describe("Event Type ID to book"),
        start: z.string().describe("Booking start time in ISO 8601 format (e.g., '2026-08-30T10:00:00Z')"),
        name: z.string().describe("Attendee's full name"),
        email: z.string().describe("Attendee's email address"),
        timeZone: z.string().optional().describe("Attendee's timezone (e.g., 'Asia/Ho_Chi_Minh')"),
        notes: z.string().optional().describe("Meeting notes or additional details"),
        location: z
          .string()
          .optional()
          .describe("Meeting location (e.g., 'Cal Video', 'Google Meet', phone)"),
      },
    },
    async (args) => {
      try {
        const result = await createBookingHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error creating booking: ${message}` }],
        };
      }
    }
  );

  // Tool 8: get_booking
  server.registerTool(
    "crove_cal_get_booking",
    {
      title: "Get Booking",
      description: "Retrieve booking details by booking UID or ID.",
      inputSchema: {
        bookingUid: z.string().optional().describe("Booking unique identifier (UID)"),
        bookingId: z.number().optional().describe("Booking numeric ID"),
      },
    },
    async (args) => {
      try {
        const result = await getBookingHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving booking: ${message}` }],
        };
      }
    }
  );

  // Tool 9: reschedule_booking
  server.registerTool(
    "crove_cal_reschedule_booking",
    {
      title: "Reschedule Booking",
      description: "Reschedule an existing booking to a new start time.",
      inputSchema: {
        bookingUid: z.string().describe("Booking unique identifier (UID) to reschedule"),
        newStart: z.string().describe("New start time in ISO 8601 format (e.g., '2026-08-31T14:00:00Z')"),
        reason: z.string().optional().describe("Reason for rescheduling"),
        rescheduledBy: z.string().optional().describe("Name/email/agent that requested rescheduling"),
      },
    },
    async (args) => {
      try {
        const result = await rescheduleBookingHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error rescheduling booking: ${message}` }],
        };
      }
    }
  );

  // Tool 10: cancel_booking
  server.registerTool(
    "crove_cal_cancel_booking",
    {
      title: "Cancel Booking",
      description: "Cancel an existing booking and free up the slot.",
      inputSchema: {
        bookingUid: z.string().describe("Booking unique identifier (UID) to cancel"),
        cancellationReason: z.string().optional().describe("Reason for cancellation"),
        cancelledBy: z.string().optional().describe("Who cancelled the meeting (e.g., 'Customer', 'Agent')"),
      },
    },
    async (args) => {
      try {
        const result = await cancelBookingHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error cancelling booking: ${message}` }],
        };
      }
    }
  );

  // Tool 11: list_bookings
  server.registerTool(
    "crove_cal_list_bookings",
    {
      title: "List Bookings",
      description: "List recent bookings with optional filter by attendee/host email and status.",
      inputSchema: {
        userEmail: z.string().optional().describe("Filter by host or attendee email address"),
        status: z
          .enum(["ACCEPTED", "CANCELLED", "PENDING", "REJECTED"])
          .optional()
          .describe("Filter by booking status"),
        limit: z.number().optional().describe("Maximum number of bookings to return (default 20)"),
      },
    },
    async (args) => {
      try {
        const result = await listBookingsHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing bookings: ${message}` }],
        };
      }
    }
  );

  // Tool 12: get_user_profile
  server.registerTool(
    "crove_cal_get_user_profile",
    {
      title: "Get User Profile",
      description:
        "Get user profile details, timezone, default schedule ID, and team memberships in Crove Cal.",
      inputSchema: {
        email: z.string().optional().describe("Email address of the user"),
        username: z.string().optional().describe("Username of the user"),
        userId: z.number().optional().describe("Numeric ID of the user"),
      },
    },
    async (args) => {
      try {
        const result = await getUserProfileHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching user profile: ${message}` }],
        };
      }
    }
  );

  // Tool 13: list_schedules
  server.registerTool(
    "crove_cal_list_schedules",
    {
      title: "List Schedules",
      description:
        "Retrieve working hours schedules and daily availability intervals for a user in Crove Cal.",
      inputSchema: {
        userId: z.number().optional().describe("User ID"),
        username: z.string().optional().describe("Username"),
        email: z.string().optional().describe("Email address"),
      },
    },
    async (args) => {
      try {
        const result = await listSchedulesHandler(prisma, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing schedules: ${message}` }],
        };
      }
    }
  );

  return server;
}
