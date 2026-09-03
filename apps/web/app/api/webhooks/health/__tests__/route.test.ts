import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { webhookMonitor } from "@calcom/lib/webhookMonitor";
import { GET, POST } from "../route";

describe("API /api/webhooks/health Endpoint", () => {
  beforeEach(() => {
    webhookMonitor.reset();
  });

  it("should return metrics with 200 OK on GET", async () => {
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

  it("should trigger and record manual ping simulation on POST", async () => {
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
