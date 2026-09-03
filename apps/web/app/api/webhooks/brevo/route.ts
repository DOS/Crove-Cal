import { BrevoService } from "@calcom/features/brevo";
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
        source: "brevo",
        event: "error.empty_body",
        status: 400,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Empty request body",
      });
      return NextResponse.json({ error: "Empty request body" }, { status: 400, headers: corsHeaders });
    }

    const payload = JSON.parse(rawBody);
    const triggerEvent = payload.triggerEvent || payload.event || "UNKNOWN";
    triggerEventName = triggerEvent;
    const eventData = payload.payload || payload.data || payload;

    const brevo = new BrevoService();
    if (!brevo.isConfigured()) {
      webhookMonitor.recordDelivery({
        source: "brevo",
        event: triggerEventName,
        status: 500,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Brevo API key is not configured",
      });
      return NextResponse.json(
        { error: "Brevo API key is not configured in CROVE_BREVO_API_KEY" },
        { status: 500, headers: corsHeaders }
      );
    }

    const attendees: Array<{ name?: string; email: string; timeZone?: string }> = eventData.attendees || [];
    const meetingTitle = eventData.eventTitle || eventData.title || "Meeting";
    const meetingStart = eventData.startTime;
    const meetingStatus =
      triggerEvent === "BOOKING_CANCELLED"
        ? "CANCELLED"
        : triggerEvent === "BOOKING_RESCHEDULED"
          ? "RESCHEDULED"
          : eventData.status || "ACCEPTED";

    const syncResults = [];

    // Sync each attendee into Brevo CRM
    for (const attendee of attendees) {
      if (attendee.email) {
        const contactRes = await brevo.upsertContact({
          email: attendee.email,
          name: attendee.name,
          meetingTitle,
          meetingStart,
          meetingStatus,
          timeZone: attendee.timeZone,
        });

        const eventName =
          triggerEvent === "BOOKING_CANCELLED"
            ? "meeting_cancelled"
            : triggerEvent === "BOOKING_RESCHEDULED"
              ? "meeting_rescheduled"
              : "meeting_booked";

        await brevo.trackEvent({
          eventName,
          email: attendee.email,
          properties: {
            meeting_title: meetingTitle,
            meeting_start: meetingStart,
            status: meetingStatus,
          },
        });

        syncResults.push({ email: attendee.email, synced: contactRes.success });
      }
    }

    webhookMonitor.recordDelivery({
      source: "brevo",
      event: triggerEventName,
      status: 200,
      latencyMs: Date.now() - startTime,
      success: true,
      summary: `Synced ${syncResults.length} attendee(s) for event: ${triggerEventName}`,
    });

    return NextResponse.json(
      {
        success: true,
        triggerEvent,
        syncedAttendees: syncResults.length,
        results: syncResults,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    webhookMonitor.recordDelivery({
      source: "brevo",
      event: triggerEventName,
      status: 500,
      latencyMs: Date.now() - startTime,
      success: false,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
