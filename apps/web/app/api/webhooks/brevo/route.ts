import { BrevoService } from "@calcom/features/brevo/brevoService";
import logger from "@calcom/lib/logger";
import { verifyWebhookSignature } from "@calcom/lib/webhook-signature";
import { webhookMonitor } from "@calcom/lib/webhookMonitor";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const log = logger.getSubLogger({ prefix: ["webhook", "brevo"] });

const brevoAttendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  timeZone: z.string().optional(),
});

const brevoEventDataSchema = z
  .object({
    attendees: z.array(brevoAttendeeSchema).max(50).optional(),
    eventTitle: z.string().optional(),
    title: z.string().optional(),
    startTime: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

const brevoWebhookBodySchema = brevoEventDataSchema.extend({
  triggerEvent: z.string().max(100).optional(),
  event: z.string().max(100).optional(),
  payload: brevoEventDataSchema.optional(),
  data: brevoEventDataSchema.optional(),
});

function parseJsonBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
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
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const secret = process.env.BREVO_WEBHOOK_SECRET;
    if (!secret) {
      log.warn("BREVO_WEBHOOK_SECRET is not configured, rejecting webhook");
      webhookMonitor.recordDelivery({
        source: "brevo",
        event: "error.unconfigured",
        status: 503,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Webhook secret is not configured",
      });
      return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
    }

    const signature = req.headers.get("x-webhook-signature");
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      log.warn("Invalid webhook signature for brevo webhook");
      webhookMonitor.recordDelivery({
        source: "brevo",
        event: "error.invalid_signature",
        status: 401,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Invalid webhook signature",
      });
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const parsedBody = brevoWebhookBodySchema.safeParse(parseJsonBody(rawBody));
    if (!parsedBody.success) {
      webhookMonitor.recordDelivery({
        source: "brevo",
        event: "error.invalid_body",
        status: 400,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Invalid request body",
      });
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const body = parsedBody.data;
    const triggerEvent = body.triggerEvent || body.event || "UNKNOWN";
    triggerEventName = triggerEvent;
    const eventData = body.payload || body.data || body;

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
      return NextResponse.json({ error: "Brevo API key is not configured" }, { status: 500 });
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

    const syncResults: Array<{ email: string; synced: boolean }> = [];

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

        const eventRes = await brevo.trackEvent({
          eventName,
          email: attendee.email,
          properties: {
            meeting_title: meetingTitle,
            meeting_start: meetingStart,
            status: meetingStatus,
          },
        });

        syncResults.push({ email: attendee.email, synced: contactRes.success && eventRes.success });

        if (!contactRes.success || !eventRes.success) {
          log.error("Brevo sync failed for attendee", {
            email: attendee.email,
            contactError: contactRes.error,
            eventError: eventRes.error,
          });
        }
      }
    }

    const allSynced = syncResults.every((result) => result.synced);
    const summary = `Synced ${syncResults.length} attendee(s) for event: ${triggerEventName}`;

    if (allSynced) {
      webhookMonitor.recordDelivery({
        source: "brevo",
        event: triggerEventName,
        status: 200,
        latencyMs: Date.now() - startTime,
        success: true,
        summary,
      });
      return NextResponse.json({
        success: true,
        partial: false,
        triggerEvent,
        syncedAttendees: syncResults.length,
        results: syncResults,
      });
    }

    if (syncResults.length > 0 && syncResults.every((result) => !result.synced)) {
      webhookMonitor.recordDelivery({
        source: "brevo",
        event: triggerEventName,
        status: 502,
        latencyMs: Date.now() - startTime,
        success: false,
        summary,
        error: "All attendee syncs failed",
      });
      log.error("Brevo webhook sync failed for all attendees", { triggerEvent: triggerEventName });
      return NextResponse.json({ success: false, error: "Failed to sync booking to Brevo" }, { status: 502 });
    }

    webhookMonitor.recordDelivery({
      source: "brevo",
      event: triggerEventName,
      status: 200,
      latencyMs: Date.now() - startTime,
      success: false,
      summary,
    });
    log.warn("Brevo webhook sync partially failed", { triggerEvent: triggerEventName });
    return NextResponse.json({
      success: false,
      partial: true,
      triggerEvent,
      syncedAttendees: syncResults.filter((result) => result.synced).length,
      results: syncResults,
    });
  } catch (error) {
    log.error("Brevo webhook processing failed", error);
    webhookMonitor.recordDelivery({
      source: "brevo",
      event: triggerEventName,
      status: 500,
      latencyMs: Date.now() - startTime,
      success: false,
      error: "Internal Server Error",
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
