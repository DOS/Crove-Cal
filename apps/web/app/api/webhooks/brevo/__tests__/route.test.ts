import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockRecordDelivery = vi.hoisted(() => vi.fn());
const mockUpsertContact = vi.fn();
const mockTrackEvent = vi.fn();
let mockIsConfigured = true;

const WEBHOOK_SECRET = "brevo-webhook-test-secret";
const SIGNATURE_HEADER = "x-webhook-signature";

vi.mock("@calcom/features/brevo/brevoService", () => {
  return {
    BrevoService: class MockBrevoService {
      isConfigured = () => mockIsConfigured;
      upsertContact = mockUpsertContact;
      trackEvent = mockTrackEvent;
    },
  };
});

vi.mock("@calcom/lib/webhookMonitor", () => ({
  webhookMonitor: {
    recordDelivery: mockRecordDelivery,
  },
}));

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

function createSignedRequest(body: string, signature?: string) {
  const headers = new Headers();
  if (signature !== undefined) {
    headers.set(SIGNATURE_HEADER, signature);
  }
  return {
    text: async () => body,
    headers,
  } as unknown as import("next/server").NextRequest;
}

function signBody(body: string, secret: string = WEBHOOK_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function createBookingPayload(attendeeCount = 1) {
  const attendees: Array<{ name: string; email: string; timeZone?: string }> = Array.from(
    { length: attendeeCount },
    (_, index) => ({
      name: `Attendee ${index}`,
      email: `attendee-${index}@example.com`,
      timeZone: "Asia/Ho_Chi_Minh",
    })
  );
  return {
    triggerEvent: "BOOKING_CREATED",
    payload: {
      eventTitle: "Discovery Call",
      startTime: "2026-09-01T10:00:00Z",
      status: "ACCEPTED",
      attendees,
    },
  };
}

describe("/api/webhooks/brevo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured = true;
    process.env.BREVO_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockUpsertContact.mockResolvedValue({ success: true });
    mockTrackEvent.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    delete process.env.BREVO_WEBHOOK_SECRET;
  });

  test("POST should return 503 and record a failed delivery when the webhook secret is unset", async () => {
    delete process.env.BREVO_WEBHOOK_SECRET;
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload());
    const res = await POST(createSignedRequest(body, signBody(body, "ignored")));

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Webhook secret is not configured");
    expect(mockUpsertContact).not.toHaveBeenCalled();
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 503, success: false }));
  });

  test("POST should return 401 when the signature header is missing", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload());
    const res = await POST(createSignedRequest(body));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid webhook signature");
    expect(mockUpsertContact).not.toHaveBeenCalled();
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 401, success: false }));
  });

  test("POST should return 401 when the signature does not match the body", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload());
    const res = await POST(createSignedRequest(body, signBody(`${body}tampered`)));

    expect(res.status).toBe(401);
    expect(mockUpsertContact).not.toHaveBeenCalled();
  });

  test("POST should return 401 when the signature is not in sha256=<hex> format", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload());
    const res = await POST(createSignedRequest(body, "not-a-signature"));

    expect(res.status).toBe(401);
    expect(mockUpsertContact).not.toHaveBeenCalled();
  });

  test("POST should return 400 when the body is not valid JSON", async () => {
    const { POST } = await import("../route");
    const body = "not-json";
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(400);
  });

  test("POST should return 400 when the attendees array exceeds 50 items", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload(51));
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(400);
    expect(mockUpsertContact).not.toHaveBeenCalled();
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 400, success: false }));
  });

  test("POST should return 400 when an attendee has an invalid email", async () => {
    const { POST } = await import("../route");
    const payload = createBookingPayload();
    payload.payload.attendees = [{ name: "Bad Email", email: "not-an-email" }];
    const body = JSON.stringify(payload);
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(400);
    expect(mockUpsertContact).not.toHaveBeenCalled();
  });

  test("POST should return 500 when Brevo is not configured", async () => {
    mockIsConfigured = false;
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload());
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Brevo API key is not configured");
  });

  test("POST should sync attendee to Brevo upon BOOKING_CREATED with a valid signature", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload());
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.syncedAttendees).toBe(1);

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "attendee-0@example.com",
        name: "Attendee 0",
        meetingTitle: "Discovery Call",
        meetingStatus: "ACCEPTED",
      })
    );

    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "meeting_booked",
        email: "attendee-0@example.com",
      })
    );
  });

  test("POST should handle BOOKING_CANCELLED event properly", async () => {
    const { POST } = await import("../route");
    const payload = {
      triggerEvent: "BOOKING_CANCELLED",
      payload: {
        eventTitle: "Discovery Call",
        startTime: "2026-09-01T10:00:00Z",
        attendees: [{ name: "Attendee 0", email: "attendee-0@example.com" }],
      },
    };
    const body = JSON.stringify(payload);
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(200);
    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "attendee-0@example.com",
        meetingStatus: "CANCELLED",
      })
    );

    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "meeting_cancelled",
        email: "attendee-0@example.com",
      })
    );
  });

  test("POST should return 200 with success:false and partial:true when some attendees fail", async () => {
    mockUpsertContact
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "Brevo API returned status 500" });
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload(2));
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.partial).toBe(true);
    expect(data.syncedAttendees).toBe(1);
    expect(data.results).toHaveLength(2);
    // Raw upstream errors must not be echoed to the client
    expect(JSON.stringify(data.results)).not.toContain("Brevo API returned status 500");
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 200, success: false }));
  });

  test("POST should return 502 with a generic error when all attendees fail to sync", async () => {
    mockUpsertContact.mockResolvedValue({ success: false, error: "Brevo API returned status 403" });
    const { POST } = await import("../route");
    const body = JSON.stringify(createBookingPayload(1));
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("Failed to sync booking to Brevo");
    expect(JSON.stringify(data)).not.toContain("Brevo API returned status 403");
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 502, success: false }));
  });
});
