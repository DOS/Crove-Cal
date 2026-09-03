import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const mockMethods = {
  isConfigured: vi.fn(),
  syncBookingEvent: vi.fn(),
};

vi.mock("@calcom/features/crove-crm", () => {
  return {
    CroveCrmService: class MockCroveCrmService {
      isConfigured() {
        return mockMethods.isConfigured();
      }
      syncBookingEvent(args: any) {
        return mockMethods.syncBookingEvent(args);
      }
    },
  };
});

describe("POST /api/webhooks/crove-crm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 500 if Crove CRM is not configured", async () => {
    mockMethods.isConfigured.mockReturnValue(false);

    const req = new NextRequest("http://localhost:3000/api/webhooks/crove-crm", {
      method: "POST",
      body: JSON.stringify({
        triggerEvent: "BOOKING_CREATED",
        payload: { uid: "123" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("CROVE_CRM_API_KEY");
  });

  it("should sync booking event and return 200 OK when configured", async () => {
    mockMethods.isConfigured.mockReturnValue(true);
    mockMethods.syncBookingEvent.mockResolvedValue({
      success: true,
      syncedContacts: 1,
      results: [{ success: true, contactId: "c_1", activityId: "a_1" }],
    });

    const req = new NextRequest("http://localhost:3000/api/webhooks/crove-crm", {
      method: "POST",
      body: JSON.stringify({
        triggerEvent: "BOOKING_CREATED",
        payload: {
          uid: "booking_123",
          eventTitle: "Consultation 30m",
          attendees: [{ email: "client@example.com", name: "Client" }],
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.syncedContacts).toBe(1);
    expect(mockMethods.syncBookingEvent).toHaveBeenCalled();
  });
});
