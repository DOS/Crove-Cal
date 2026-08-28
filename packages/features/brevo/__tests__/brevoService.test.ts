import { beforeEach, describe, expect, test, vi } from "vitest";
import { BrevoService } from "../brevoService";

describe("BrevoService", () => {
  const TEST_API_KEY = "xkeysib-test-123456789";

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  test("should check if configured properly", () => {
    const unconfigured = new BrevoService("");
    expect(unconfigured.isConfigured()).toBe(false);

    const configured = new BrevoService(TEST_API_KEY);
    expect(configured.isConfigured()).toBe(true);
  });

  test("upsertContact should call Brevo contacts API with formatted attributes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ id: 123 }),
    });
    global.fetch = mockFetch;

    const brevo = new BrevoService(TEST_API_KEY);
    const result = await brevo.upsertContact({
      email: "client@example.com",
      name: "Alice Nguyen",
      meetingTitle: "30 Min Discovery",
      meetingStart: "2026-09-01T10:00:00Z",
      meetingStatus: "ACCEPTED",
      timeZone: "Asia/Ho_Chi_Minh",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/contacts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "api-key": TEST_API_KEY,
        }),
        body: JSON.stringify({
          email: "client@example.com",
          attributes: {
            FIRSTNAME: "Alice",
            LASTNAME: "Nguyen",
            LAST_MEETING_TITLE: "30 Min Discovery",
            LAST_MEETING_START: "2026-09-01T10:00:00Z",
            LAST_MEETING_STATUS: "ACCEPTED",
            TIMEZONE: "Asia/Ho_Chi_Minh",
          },
          updateEnabled: true,
        }),
      })
    );
  });

  test("trackEvent should send event to Brevo tracking endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    global.fetch = mockFetch;

    const brevo = new BrevoService(TEST_API_KEY);
    const result = await brevo.trackEvent({
      eventName: "meeting_booked",
      email: "client@example.com",
      properties: {
        title: "30 Min Discovery",
      },
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "api-key": TEST_API_KEY,
        }),
      })
    );
  });
});
