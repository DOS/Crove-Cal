import { CroveCrmService } from "@calcom/features/crove-crm";
import logger from "@calcom/lib/logger";
import { verifyWebhookSignature } from "@calcom/lib/webhook-signature";
import { webhookMonitor } from "@calcom/lib/webhookMonitor";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const log = logger.getSubLogger({ prefix: ["webhook", "crove-crm"] });

const croveCrmAttendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  timeZone: z.string().optional(),
  phoneNumber: z.string().optional(),
});

const croveCrmEventDataSchema = z
  .object({
    uid: z.string().optional(),
    title: z.string().optional(),
    eventTitle: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    status: z.string().optional(),
    organizer: z
      .object({
        email: z.string(),
        name: z.string().optional(),
      })
      .optional(),
    attendees: z.array(croveCrmAttendeeSchema).max(50).optional(),
    teamId: z.union([z.string(), z.number()]).optional(),
    organizationId: z.union([z.string(), z.number()]).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

const croveCrmWebhookBodySchema = croveCrmEventDataSchema.extend({
  triggerEvent: z.string().max(100).optional(),
  event: z.string().max(100).optional(),
  payload: croveCrmEventDataSchema.optional(),
  data: croveCrmEventDataSchema.optional(),
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
        source: "crove-crm",
        event: "error.empty_body",
        status: 400,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Empty request body",
      });
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const secret = process.env.CROVE_CRM_WEBHOOK_SECRET;
    if (!secret) {
      log.warn("CROVE_CRM_WEBHOOK_SECRET is not configured, rejecting webhook");
      webhookMonitor.recordDelivery({
        source: "crove-crm",
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
      log.warn("Invalid webhook signature for crove-crm webhook");
      webhookMonitor.recordDelivery({
        source: "crove-crm",
        event: "error.invalid_signature",
        status: 401,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Invalid webhook signature",
      });
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const parsedBody = croveCrmWebhookBodySchema.safeParse(parseJsonBody(rawBody));
    if (!parsedBody.success) {
      webhookMonitor.recordDelivery({
        source: "crove-crm",
        event: "error.invalid_body",
        status: 400,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Invalid request body",
      });
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const body = parsedBody.data;
    const triggerEvent = body.triggerEvent || body.event || "BOOKING_CREATED";
    triggerEventName = triggerEvent;
    const eventData = body.payload || body.data || body;

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
      return NextResponse.json({ error: "Crove CRM API key is not configured" }, { status: 500 });
    }

    const syncResult = await crm.syncBookingEvent({
      triggerEvent,
      payload: eventData,
    });

    if (!syncResult.success) {
      log.error("Crove CRM sync reported failure", {
        triggerEvent: triggerEventName,
        syncedContacts: syncResult.syncedContacts,
        totalResults: syncResult.results.length,
      });
    }

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
        // Raw upstream errors are logged server-side only, never echoed to the client
        results: syncResult.results.map(({ success, contactId, activityId }) => ({
          success,
          contactId,
          activityId,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    log.error("Crove CRM webhook processing failed", error);
    webhookMonitor.recordDelivery({
      source: "crove-crm",
      event: triggerEventName,
      status: 500,
      latencyMs: Date.now() - startTime,
      success: false,
      error: "Internal Server Error",
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
