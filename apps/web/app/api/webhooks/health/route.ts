import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { type NextRequest, NextResponse } from "next/server";
import { webhookMonitor } from "@calcom/lib/webhookMonitor";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-dos-signature",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

async function getMonitoringHandler(req: NextRequest) {
  const metrics = webhookMonitor.getMetrics();
  const statusCode = metrics.status === "failing" ? 503 : 200;

  return NextResponse.json(
    {
      service: "crove-cal-webhooks",
      timestamp: new Date().toISOString(),
      ...metrics,
    },
    {
      status: statusCode,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

async function postTriggerPingHandler(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const source = body.source || "dos-org-sync";
    const event = body.event || "test.ping";

    // Record test delivery in monitor
    const delivery = webhookMonitor.recordDelivery({
      source,
      event,
      status: 200,
      latencyMs: Date.now() - startTime + 5,
      success: true,
      summary: `Manual test ping simulation for ${source}`,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Ping simulation recorded successfully",
        delivery,
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const GET = defaultResponderForAppDir(getMonitoringHandler);
export const POST = defaultResponderForAppDir(postTriggerPingHandler);
