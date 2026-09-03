"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { WebhookMonitoringSummary } from "@calcom/lib/webhookMonitor";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import {
  ActivityIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  PlayIcon,
  RefreshCwIcon,
  SendIcon,
  ServerIcon,
  ShieldAlertIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function WebhookMonitoringDashboard() {
  const { t } = useLocale();
  const [data, setData] = useState<WebhookMonitoringSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const res = await fetch("/api/webhooks/health", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch webhook metrics:", err);
    } finally {
      setIsLoading(false);
      if (showSpinner) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMetrics(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchMetrics, autoRefresh]);

  const handleSimulatePing = async (source: string) => {
    setIsTestingPing(true);
    try {
      const res = await fetch("/api/webhooks/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, event: "test.ping" }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Simulated test ping recorded for ${source}`, "success");
        await fetchMetrics(false);
      } else {
        showToast(json.error || "Simulation failed", "error");
      }
    } catch (err) {
      showToast("Network error during ping test", "error");
    } finally {
      setIsTestingPing(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "healthy":
        return <Badge variant="green">Healthy (200 OK)</Badge>;
      case "degraded":
        return <Badge variant="orange">Degraded (&gt;20% Err)</Badge>;
      case "failing":
        return <Badge variant="red">Failing (&gt;50% Err)</Badge>;
      default:
        return <Badge variant="gray">Idle / Listening</Badge>;
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-default">Webhook Health & Realtime Monitoring</h1>
            {data && getStatusBadge(data.status)}
          </div>
          <p className="mt-1 text-sm text-subtle">
            Realtime event pipeline status, latency metrics, and delivery audit logs across the Crove Ecosystem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="icon"
            color="secondary"
            onClick={() => setAutoRefresh((prev) => !prev)}
            title={autoRefresh ? "Pause Live Auto-Refresh (5s)" : "Resume Live Auto-Refresh (5s)"}
            className={autoRefresh ? "text-primary border-primary" : "text-muted"}>
            <ActivityIcon className={`h-4 w-4 ${autoRefresh ? "animate-pulse" : ""}`} />
            <span className="text-xs">{autoRefresh ? "Live 5s" : "Paused"}</span>
          </Button>

          <Button
            type="button"
            color="secondary"
            onClick={() => fetchMetrics(true)}
            loading={isRefreshing}
            StartIcon="refresh-ccw">
            Refresh
          </Button>

          <Button
            type="button"
            onClick={() => handleSimulatePing("dos-org-sync")}
            loading={isTestingPing}
            StartIcon="send">
            Simulate Ping
          </Button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-subtle bg-default p-4 shadow-xs">
          <div className="flex items-center justify-between text-subtle">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Received</span>
            <ServerIcon className="h-4 w-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-default">{data?.totalEvents ?? 0}</span>
            <span className="text-xs text-subtle">events</span>
          </div>
          <p className="mt-1 text-xs text-subtle">In-memory circular telemetry buffer</p>
        </div>

        <div className="rounded-xl border border-subtle bg-default p-4 shadow-xs">
          <div className="flex items-center justify-between text-subtle">
            <span className="text-xs font-semibold uppercase tracking-wider">Success Rate</span>
            <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-default">{data?.successRate ?? 100}%</span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              {data?.successCount ?? 0} ok / {data?.failureCount ?? 0} failed
            </span>
          </div>
          <p className="mt-1 text-xs text-subtle">Target threshold &ge; 99.9%</p>
        </div>

        <div className="rounded-xl border border-subtle bg-default p-4 shadow-xs">
          <div className="flex items-center justify-between text-subtle">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Latency</span>
            <ClockIcon className="h-4 w-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-default">{data?.avgLatencyMs ?? 0}</span>
            <span className="text-xs text-subtle">ms response</span>
          </div>
          <p className="mt-1 text-xs text-subtle">Server processing &amp; database execution</p>
        </div>

        <div className="rounded-xl border border-subtle bg-default p-4 shadow-xs">
          <div className="flex items-center justify-between text-subtle">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Channels</span>
            <ZapIcon className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-default">{data?.activeListeners ?? 5}</span>
            <span className="text-xs text-subtle">integrated routes</span>
          </div>
          <p className="mt-1 text-xs text-subtle">DOS.Me, Brevo, Google/MS, Stripe, Cal</p>
        </div>
      </div>

      {/* Route-by-Route Breakdown Grid */}
      <div>
        <h2 className="text-base font-semibold text-default mb-3">Integrated Webhook Channels</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.routes &&
            Object.entries(data.routes).map(([key, route]) => (
              <div
                key={key}
                className="flex flex-col justify-between rounded-xl border border-subtle bg-default p-4 shadow-xs transition hover:border-emphasis">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-default">{route.name}</h3>
                    {getStatusBadge(route.status)}
                  </div>
                  <p className="mt-1 text-xs font-mono text-subtle">/api/webhooks/{route.source}</p>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-subtle pt-3 text-center">
                    <div>
                      <span className="text-xs text-subtle">Events</span>
                      <p className="font-bold text-sm text-default">{route.total}</p>
                    </div>
                    <div>
                      <span className="text-xs text-subtle">Success</span>
                      <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400">{route.success}</p>
                    </div>
                    <div>
                      <span className="text-xs text-subtle">Latency</span>
                      <p className="font-bold text-sm text-default">{route.avgLatencyMs}ms</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-subtle pt-3">
                  <span className="text-[11px] text-subtle truncate">
                    {route.lastEventAt ? `Last: ${new Date(route.lastEventAt).toLocaleTimeString()}` : "No events yet"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSimulatePing(route.source)}
                    disabled={isTestingPing}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <PlayIcon className="h-3 w-3" /> Test Ping
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Live Deliveries Log Table */}
      <div className="rounded-xl border border-subtle bg-default shadow-xs">
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <div>
            <h2 className="font-semibold text-sm text-default">Live Delivery Audit Log</h2>
            <p className="text-xs text-subtle">Recent incoming and outgoing webhook payload dispatches</p>
          </div>
          <Link
            href="/settings/developer/webhooks"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Manage Webhooks &rarr;
          </Link>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-cal-muted" />
            ))}
          </div>
        ) : data && data.recentDeliveries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-subtle bg-cal-muted text-subtle">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-5 py-3 font-semibold">Event</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Latency</th>
                  <th className="px-5 py-3 font-semibold">Summary / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {data.recentDeliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-subtle transition">
                    <td className="px-5 py-3 font-mono text-subtle whitespace-nowrap">
                      {new Date(delivery.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-3 font-medium text-default whitespace-nowrap">
                      <span className="rounded-md bg-cal-muted px-2 py-1 font-mono text-[11px]">
                        {delivery.source}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-default font-medium">{delivery.event}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          delivery.status >= 200 && delivery.status < 300
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}>
                        {delivery.status} {delivery.success ? "OK" : "ERR"}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-subtle whitespace-nowrap">{delivery.latencyMs}ms</td>
                    <td className="px-5 py-3 text-subtle max-w-xs truncate">
                      {delivery.error ? (
                        <span className="text-rose-500">{delivery.error}</span>
                      ) : (
                        delivery.summary || "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <ShieldAlertIcon className="mx-auto h-8 w-8 text-muted" />
            <h3 className="mt-2 font-medium text-sm text-default">No webhook events recorded yet</h3>
            <p className="mt-1 text-xs text-subtle">
              Events will appear automatically in realtime as webhook requests arrive, or click below to simulate a test ping.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                size="sm"
                onClick={() => handleSimulatePing("dos-org-sync")}
                loading={isTestingPing}
                StartIcon="send">
                Send Test Ping
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
