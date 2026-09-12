import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { NextRequest } from "next/server";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { webhookMonitor } from "@calcom/lib/webhookMonitor";

import { GET, POST } from "../route";

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: vi.fn(),
}));

// next/headers must be mocked because the jsdom test env has no request scope
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

const mockedGetServerSession = vi.mocked(getServerSession);

function makeTestSession(role: "ADMIN" | "USER"): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    hasValidLicense: true,
    upId: "1",
    user: {
      id: 1,
      uuid: "00000000-0000-0000-0000-000000000000",
      role,
    },
  };
}

describe("API /api/webhooks/health Endpoint", () => {
  beforeEach(() => {
    webhookMonitor.reset();
    mockedGetServerSession.mockReset();
  });

  it("should return 401 on GET when unauthenticated", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/webhooks/health");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toBe("Unauthorized");
    expect(mockedGetServerSession).toHaveBeenCalledTimes(1);
  });

  it("should return 401 on POST when unauthenticated", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/webhooks/health", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(401);
  });

  it("should return metrics with 200 OK on GET when authenticated", async () => {
    mockedGetServerSession.mockResolvedValue(makeTestSession("USER"));
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: "test.ping",
      status: 200,
      latencyMs: 12,
      success: true,
    });

    const req = new NextRequest("http://localhost:3000/api/webhooks/health");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("crove-cal-webhooks");
    expect(json.totalEvents).toBe(1);
    expect(json.successCount).toBe(1);
    expect(json.status).toBe("healthy");
    expect(json.recentDeliveries).toHaveLength(1);
  });

  it("should return 403 on POST for authenticated non-admin", async () => {
    mockedGetServerSession.mockResolvedValue(makeTestSession("USER"));

    const req = new NextRequest("http://localhost:3000/api/webhooks/health", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(403);
    expect(webhookMonitor.getMetrics().totalEvents).toBe(0);
  });

  it("should trigger and record manual ping simulation on POST for admin", async () => {
    mockedGetServerSession.mockResolvedValue(makeTestSession("ADMIN"));

    const req = new NextRequest("http://localhost:3000/api/webhooks/health", {
      method: "POST",
      body: JSON.stringify({
        source: "brevo",
        event: "test.ping",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.delivery.source).toBe("brevo");
    expect(json.delivery.event).toBe("test.ping");

    const metrics = webhookMonitor.getMetrics();
    expect(metrics.totalEvents).toBe(1);
  });
});
