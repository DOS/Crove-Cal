import { beforeEach, describe, expect, it, vi } from "vitest";
import { CroveCrmService } from "../croveCrmService";

describe("CroveCrmService", () => {
  const TEST_API_KEY = "crm_live_test_123456789";

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should report isConfigured correctly based on API key", () => {
    const unconfigured = new CroveCrmService("");
    expect(unconfigured.isConfigured()).toBe(false);

    const configured = new CroveCrmService(TEST_API_KEY);
    expect(configured.isConfigured()).toBe(true);
  });

  it("upsertContact should post structured contact payload with team & org mapping to Crove CRM", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "contact_123" }),
    });
    global.fetch = mockFetch;

    const crm = new CroveCrmService(TEST_API_KEY);
    const result = await crm.upsertContact({
      email: "lead@example.com",
      name: "David Nguyen",
      phone: "+84901234567",
      timeZone: "Asia/Ho_Chi_Minh",
      organizationId: "org_987654321",
      teamId: "team_11223344",
    });

    expect(result.success).toBe(true);
    expect(result.contactId).toBe("contact_123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://crm.crove.com/api/v1/contacts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: "lead@example.com",
          name: "David Nguyen",
          first_name: "David",
          last_name: "Nguyen",
          phone: "+84901234567",
          timezone: "Asia/Ho_Chi_Minh",
          organization_id: "org_987654321",
          team_id: "team_11223344",
          source: "crove-cal",
          tags: ["cal-booking", "source:crove-cal"],
          custom_fields: {},
        }),
      })
    );
  });

  it("recordBookingActivity should post timeline activity payload to Crove CRM", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "act_456" }),
    });
    global.fetch = mockFetch;

    const crm = new CroveCrmService(TEST_API_KEY);
    const result = await crm.recordBookingActivity({
      contactEmail: "lead@example.com",
      activityType: "meeting_scheduled",
      bookingUid: "bk_789",
      title: "Discovery Call 30m",
      startTime: "2026-09-03T10:00:00Z",
      organizerEmail: "host@crove.com",
      organizationId: "org_987654321",
      teamId: "team_11223344",
    });

    expect(result.success).toBe(true);
    expect(result.activityId).toBe("act_456");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://crm.crove.com/api/v1/activities",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_API_KEY}`,
        }),
      })
    );
  });

  it("syncBookingEvent should handle full booking lifecycle and multiple attendees", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "synced_id" }),
    });
    global.fetch = mockFetch;

    const crm = new CroveCrmService(TEST_API_KEY);
    const result = await crm.syncBookingEvent({
      triggerEvent: "BOOKING_CREATED",
      payload: {
        uid: "booking_abc",
        title: "Product Demo",
        startTime: "2026-09-03T14:00:00Z",
        organizer: { email: "sales@crove.com", name: "Sales Rep" },
        attendees: [
          { email: "client1@acme.com", name: "Client One" },
          { email: "client2@acme.com", name: "Client Two" },
        ],
        organizationId: "org_1",
        teamId: "team_sales",
      },
    });

    expect(result.success).toBe(true);
    expect(result.syncedContacts).toBe(2);
    // 2 attendees x (1 contact upsert + 1 activity record) = 4 API calls
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
