export interface WebhookDeliveryLog {
  id: string;
  source: "dos-org-sync" | "brevo" | "calendar-subscription" | "stripe" | "user-webhook" | string;
  event: string;
  status: number;
  latencyMs: number;
  timestamp: string;
  success: boolean;
  error?: string;
  ip?: string;
  summary?: string;
}

export interface RouteMetric {
  name: string;
  source: string;
  total: number;
  success: number;
  failure: number;
  avgLatencyMs: number;
  lastEventAt: string | null;
  status: "healthy" | "degraded" | "failing" | "idle";
}

export interface WebhookMonitoringSummary {
  status: "healthy" | "degraded" | "failing" | "idle";
  totalEvents: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
  activeListeners: number;
  uptimeSeconds: number;
  routes: Record<string, RouteMetric>;
  recentDeliveries: WebhookDeliveryLog[];
}

const MAX_LOG_SIZE = 100;

class WebhookMonitorService {
  private logs: WebhookDeliveryLog[] = [];
  private startTime = Date.now();

  private routeConfig: Record<string, { name: string }> = {
    "dos-org-sync": { name: "DOS.Me Org & Identity Sync" },
    brevo: { name: "Brevo CRM Event Bridge" },
    "calendar-subscription": { name: "Google & Microsoft Calendar Sync" },
    stripe: { name: "Stripe Payment & Subscriptions" },
    "user-webhook": { name: "Outgoing User Webhooks" },
  };

  /**
   * Record a webhook processing event
   */
  public recordDelivery(entry: Omit<WebhookDeliveryLog, "id" | "timestamp"> & { id?: string; timestamp?: string }): WebhookDeliveryLog {
    const logItem: WebhookDeliveryLog = {
      id: entry.id || `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: entry.source,
      event: entry.event,
      status: entry.status,
      latencyMs: Math.max(0, Math.round(entry.latencyMs)),
      timestamp: entry.timestamp || new Date().toISOString(),
      success: entry.success ?? (entry.status >= 200 && entry.status < 300),
      error: entry.error,
      ip: entry.ip,
      summary: entry.summary,
    };

    this.logs.unshift(logItem);
    if (this.logs.length > MAX_LOG_SIZE) {
      this.logs = this.logs.slice(0, MAX_LOG_SIZE);
    }

    return logItem;
  }

  /**
   * Calculate aggregated metrics and health status
   */
  public getMetrics(): WebhookMonitoringSummary {
    const totalEvents = this.logs.length;
    const successCount = this.logs.filter((l) => l.success).length;
    const failureCount = totalEvents - successCount;
    const successRate = totalEvents > 0 ? Math.round((successCount / totalEvents) * 1000) / 10 : 100;
    const totalLatency = this.logs.reduce((acc, l) => acc + l.latencyMs, 0);
    const avgLatencyMs = totalEvents > 0 ? Math.round(totalLatency / totalEvents) : 0;

    const routes: Record<string, RouteMetric> = {};

    for (const [sourceKey, cfg] of Object.entries(this.routeConfig)) {
      const routeLogs = this.logs.filter((l) => l.source === sourceKey);
      const routeTotal = routeLogs.length;
      const routeSuccess = routeLogs.filter((l) => l.success).length;
      const routeFailure = routeTotal - routeSuccess;
      const routeLatency = routeLogs.reduce((acc, l) => acc + l.latencyMs, 0);
      const routeAvgLatency = routeTotal > 0 ? Math.round(routeLatency / routeTotal) : 0;
      const lastEventAt = routeLogs.length > 0 ? routeLogs[0].timestamp : null;

      let status: RouteMetric["status"] = "idle";
      if (routeTotal > 0) {
        const routeSuccessRate = (routeSuccess / routeTotal) * 100;
        if (routeSuccessRate >= 95) {
          status = "healthy";
        } else if (routeSuccessRate >= 80) {
          status = "degraded";
        } else {
          status = "failing";
        }
      }

      routes[sourceKey] = {
        name: cfg.name,
        source: sourceKey,
        total: routeTotal,
        success: routeSuccess,
        failure: routeFailure,
        avgLatencyMs: routeAvgLatency,
        lastEventAt,
        status,
      };
    }

    let overallStatus: WebhookMonitoringSummary["status"] = "idle";
    if (totalEvents > 0) {
      if (successRate >= 95) {
        overallStatus = "healthy";
      } else if (successRate >= 80) {
        overallStatus = "degraded";
      } else {
        overallStatus = "failing";
      }
    }

    return {
      status: overallStatus,
      totalEvents,
      successCount,
      failureCount,
      successRate,
      avgLatencyMs,
      activeListeners: Object.keys(this.routeConfig).length,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      routes,
      recentDeliveries: this.logs.slice(0, 50),
    };
  }

  /**
   * Reset logs (for testing or maintenance)
   */
  public reset(): void {
    this.logs = [];
    this.startTime = Date.now();
  }
}

// Ensure singleton instance in global scope across Next.js hot-reloads
const globalForWebhookMonitor = globalThis as unknown as {
  __croveWebhookMonitor?: WebhookMonitorService;
};

export const webhookMonitor =
  globalForWebhookMonitor.__croveWebhookMonitor || new WebhookMonitorService();

if (process.env.NODE_ENV !== "production") {
  globalForWebhookMonitor.__croveWebhookMonitor = webhookMonitor;
}

export default webhookMonitor;
