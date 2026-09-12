import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRecordDelivery = vi.hoisted(() => vi.fn());
const mockMethods = {
  isConfigured: vi.fn(),
  syncBookingEvent: vi.fn(),
};

const WEBHOOK_SECRET = "crove-crm-webhook-test-secret";
const SIGNATURE_HEADER = "x-webhook-signature";

vi.mock("@calcom/features/crove-crm/croveCrmService", () => {
  return {
    CroveCrmService: class MockCroveCrmService {
      isConfigured() {
        return mockMethods.isConfigured();
      }
      syncBookingEvent(args: unknown) {
        return mockMethods.syncBookingEvent(args);
      }
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

function createBookingBody(attendeeCount = 1): string {
  return JSON.stringify({
    triggerEvent: "BOOKING_CREATED",
    payload: {
      uid: "booking_123",
      eventTitle: "Consultation 30m",
      attendees: Array.from({ length: attendeeCount }, (_, index) => ({
        email: `client-${index}@example.com`,
        name: `Client ${index}`,
      })),
    },
  });
}

describe("POST /api/webhooks/crove-crm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CROVE_CRM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockMethods.isConfigured.mockReturnValue(true);
    mockMethods.syncBookingEvent.mockResolvedValue({
      success: true,
      syncedContacts: 1,
      results: [{ success: true, contactId: "c_1", activityId: "a_1" }],
    });
  });

  afterEach(() => {
    delete process.env.CROVE_CRM_WEBHOOK_SECRET;
  });

  it("should return 503 and record a failed delivery when the webhook secret is unset", async () => {
    delete process.env.CROVE_CRM_WEBHOOK_SECRET;
    const { POST } = await import("../route");
    const body = createBookingBody();
    const res = await POST(createSignedRequest(body, signBody(body, "ignored")));

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("Webhook secret is not configured");
    expect(mockMethods.syncBookingEvent).not.toHaveBeenCalled();
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 503, success: false }));
  });

  it("should return 401 when the signature header is missing", async () => {
    const { POST } = await import("../route");
    const res = await POST(createSignedRequest(createBookingBody()));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid webhook signature");
    expect(mockMethods.syncBookingEvent).not.toHaveBeenCalled();
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 401, success: false }));
  });

  it("should return 401 when the signature does not match the body", async () => {
    const { POST } = await import("../route");
    const body = createBookingBody();
    const res = await POST(createSignedRequest(body, signBody(`${body}tampered`)));

    expect(res.status).toBe(401);
    expect(mockMethods.syncBookingEvent).not.toHaveBeenCalled();
  });

  it("should return 400 when the attendees array exceeds 50 items", async () => {
    const { POST } = await import("../route");
    const body = createBookingBody(51);
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(400);
    expect(mockMethods.syncBookingEvent).not.toHaveBeenCalled();
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 400, success: false }));
  });

  it("should return 400 when an attendee has an invalid email", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      payload: { uid: "booking_123", attendees: [{ email: "not-an-email" }] },
    });
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(400);
    expect(mockMethods.syncBookingEvent).not.toHaveBeenCalled();
  });

  it("should return 500 if Crove CRM is not configured", async () => {
    mockMethods.isConfigured.mockReturnValue(false);
    const { POST } = await import("../route");
    const body = createBookingBody();
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Crove CRM API key is not configured");
  });

  it("should sync booking event and return 200 OK when configured and signed", async () => {
    const { POST } = await import("../route");
    const body = createBookingBody();
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.syncedContacts).toBe(1);
    expect(mockMethods.syncBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerEvent: "BOOKING_CREATED",
        payload: expect.objectContaining({ uid: "booking_123" }),
      })
    );
  });

  it("should not echo raw upstream errors to the client when the sync fails", async () => {
    mockMethods.syncBookingEvent.mockResolvedValue({
      success: false,
      syncedContacts: 0,
      results: [{ success: false, error: "Crove CRM API returned status 500" }],
    });
    const { POST } = await import("../route");
    const body = createBookingBody();
    const res = await POST(createSignedRequest(body, signBody(body)));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(JSON.stringify(json)).not.toContain("Crove CRM API returned status 500");
    expect(mockRecordDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: 200, success: false }));
  });
});
