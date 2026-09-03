import { beforeEach, describe, expect, it } from "vitest";
import { webhookMonitor } from "../webhookMonitor";

describe("WebhookMonitor", () => {
  beforeEach(() => {
    webhookMonitor.reset();
  });

  it("should initialize with idle status and zero events", () => {
    const metrics = webhookMonitor.getMetrics();
    expect(metrics.status).toBe("idle");
    expect(metrics.totalEvents).toBe(0);
    expect(metrics.successCount).toBe(0);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.successRate).toBe(100);
    expect(metrics.recentDeliveries).toHaveLength(0);
  });

  it("should record successful webhook delivery and compute latency and rate", () => {
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: "org.created",
      status: 200,
      latencyMs: 45,
      success: true,
      summary: "Organization created: Acquired Company",
    });

    const metrics = webhookMonitor.getMetrics();
    expect(metrics.totalEvents).toBe(1);
    expect(metrics.successCount).toBe(1);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.successRate).toBe(100);
    expect(metrics.avgLatencyMs).toBe(45);
    expect(metrics.status).toBe("healthy");

    expect(metrics.routes["dos-org-sync"].total).toBe(1);
    expect(metrics.routes["dos-org-sync"].success).toBe(1);
    expect(metrics.routes["dos-org-sync"].status).toBe("healthy");
    expect(metrics.recentDeliveries[0].event).toBe("org.created");
  });

  it("should track failures and transition status to degraded / failing", () => {
    // 3 successes, 2 failures -> 60% success rate -> failing
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: "test.ping",
      status: 200,
      latencyMs: 10,
      success: true,
    });
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: "member_added",
      status: 200,
      latencyMs: 20,
      success: true,
    });
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: "member_removed",
      status: 200,
      latencyMs: 30,
      success: true,
    });
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: "org.created",
      status: 401,
      latencyMs: 5,
      success: false,
      error: "Invalid signature",
    });
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: "org.updated",
      status: 500,
      latencyMs: 60,
      success: false,
      error: "Database timeout",
    });

    const metrics = webhookMonitor.getMetrics();
    expect(metrics.totalEvents).toBe(5);
    expect(metrics.successCount).toBe(3);
    expect(metrics.failureCount).toBe(2);
    expect(metrics.successRate).toBe(60);
    expect(metrics.status).toBe("failing");
    expect(metrics.avgLatencyMs).toBe(25); // (10+20+30+5+60)/5 = 25
  });

  it("should cap recent logs to maximum size", () => {
    for (let i = 0; i < 120; i++) {
      webhookMonitor.recordDelivery({
        source: "stripe",
        event: "checkout.session.completed",
        status: 200,
        latencyMs: 15,
        success: true,
      });
    }

    const metrics = webhookMonitor.getMetrics();
    expect(metrics.totalEvents).toBe(100);
    expect(metrics.recentDeliveries).toHaveLength(50); // recentDeliveries returns latest 50
  });
});
