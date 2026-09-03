import { CroveCrmService } from "@calcom/features/crove-crm";
import { webhookMonitor } from "@calcom/lib/webhookMonitor";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-cal-signature-256",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let triggerEventName = "unknown";

  try {
    const rawBody = await req.text();
    if (!rawBody) {
      webhookMonitor.recordDelivery({
        source: "crove-crm",
        event: "error.empty_body",
        status: 400,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Empty request body",
      });
      return NextResponse.json({ error: "Empty request body" }, { status: 400, headers: corsHeaders });
    }

    const payload = JSON.parse(rawBody);
    const triggerEvent = payload.triggerEvent || payload.event || "BOOKING_CREATED";
    triggerEventName = triggerEvent;
    const eventData = payload.payload || payload.data || payload;

    const crm = new CroveCrmService();
    if (!crm.isConfigured()) {
      webhookMonitor.recordDelivery({
        source: "crove-crm",
        event: triggerEventName,
        status: 500,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Crove CRM API key is not configured",
      });
      return NextResponse.json(
        { error: "Crove CRM API key is not configured in CROVE_CRM_API_KEY" },
        { status: 500, headers: corsHeaders }
      );
    }

    const syncResult = await crm.syncBookingEvent({
      triggerEvent,
      payload: eventData,
    });

    webhookMonitor.recordDelivery({
      source: "crove-crm",
      event: triggerEventName,
      status: 200,
      latencyMs: Date.now() - startTime,
      success: syncResult.success,
      summary: `Synced ${syncResult.syncedContacts} contact(s) and activities into Crove CRM`,
    });

    return NextResponse.json(
      {
        success: syncResult.success,
        triggerEvent,
        syncedContacts: syncResult.syncedContacts,
        results: syncResult.results,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    webhookMonitor.recordDelivery({
      source: "crove-crm",
      event: triggerEventName,
      status: 500,
      latencyMs: Date.now() - startTime,
      success: false,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
