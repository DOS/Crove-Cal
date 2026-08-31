import { beforeEach, describe, expect, test, vi } from "vitest";

const mockUpsertContact = vi.fn();
const mockTrackEvent = vi.fn();
let mockIsConfigured = true;

vi.mock("@calcom/features/brevo", () => {
  return {
    BrevoService: class MockBrevoService {
      isConfigured = () => mockIsConfigured;
      upsertContact = mockUpsertContact;
      trackEvent = mockTrackEvent;
    },
  };
});

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Headers;

    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers ?? {});
    }

    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return {
        status: init?.status ?? 200,
        headers: new Headers(init?.headers ?? {}),
        json: async () => data,
      };
    }
  }

  return {
    NextResponse: MockNextResponse,
  };
});

function createMockRequest(body: string) {
  return {
    text: async () => body,
  } as unknown as import("next/server").NextRequest;
}

describe("/api/webhooks/brevo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured = true;
    mockUpsertContact.mockResolvedValue({ success: true });
    mockTrackEvent.mockResolvedValue({ success: true });
  });

  test("OPTIONS should return 204 with CORS headers", async () => {
    const { OPTIONS } = await import("../route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("POST should return 500 when Brevo is not configured", async () => {
    mockIsConfigured = false;
    const { POST } = await import("../route");
    const req = createMockRequest(JSON.stringify({ triggerEvent: "BOOKING_CREATED", payload: {} }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Brevo API key is not configured");
  });

  test("POST should sync attendee to Brevo upon BOOKING_CREATED", async () => {
    const { POST } = await import("../route");
    const payload = {
      triggerEvent: "BOOKING_CREATED",
      payload: {
        eventTitle: "Discovery Call",
        startTime: "2026-09-01T10:00:00Z",
        status: "ACCEPTED",
        attendees: [
          {
            name: "John Doe",
            email: "john@example.com",
            timeZone: "Asia/Ho_Chi_Minh",
          },
        ],
      },
    };

    const req = createMockRequest(JSON.stringify(payload));
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "john@example.com",
        name: "John Doe",
        meetingTitle: "Discovery Call",
        meetingStatus: "ACCEPTED",
      })
    );

    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "meeting_booked",
        email: "john@example.com",
      })
    );
  });

  test("POST should handle BOOKING_CANCELLED event properly", async () => {
    const { POST } = await import("../route");
    const payload = {
      triggerEvent: "BOOKING_CANCELLED",
      payload: {
        eventTitle: "Discovery Call",
        attendees: [
          {
            name: "John Doe",
            email: "john@example.com",
          },
        ],
      },
    };

    const req = createMockRequest(JSON.stringify(payload));
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "john@example.com",
        meetingStatus: "CANCELLED",
      })
    );

    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "meeting_cancelled",
        email: "john@example.com",
      })
    );
  });
});
