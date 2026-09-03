import type { CroveCrmActivityInput, CroveCrmContactInput, CroveCrmSyncResult } from "./types";

export class CroveCrmService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = (apiKey || process.env.CROVE_CRM_API_KEY || "").trim();
    this.baseUrl = (baseUrl || process.env.CROVE_CRM_API_URL || "https://crm.crove.com/api/v1").replace(/\/$/, "");
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  /**
   * Create or update a contact in Crove CRM
   */
  public async upsertContact(input: CroveCrmContactInput): Promise<CroveCrmSyncResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "Crove CRM API key is not configured (CROVE_CRM_API_KEY)" };
    }

    if (!input.email) {
      return { success: false, error: "Contact email is required" };
    }

    let firstName = input.firstName;
    let lastName = input.lastName;
    if (!firstName && input.name) {
      const parts = input.name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ") || undefined;
    }

    const payload = {
      email: input.email.toLowerCase().trim(),
      name: input.name,
      first_name: firstName,
      last_name: lastName,
      phone: input.phone,
      timezone: input.timeZone,
      organization_id: input.organizationId ? String(input.organizationId) : undefined,
      team_id: input.teamId ? String(input.teamId) : undefined,
      source: "crove-cal",
      tags: Array.from(new Set([...(input.tags || []), "cal-booking", "source:crove-cal"])),
      custom_fields: input.customFields || {},
    };

    try {
      const response = await fetch(`${this.baseUrl}/contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok || response.status === 200 || response.status === 201) {
        const json = await response.json().catch(() => ({}));
        return {
          success: true,
          contactId: json.id || json.data?.id,
        };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `Crove CRM API returned status ${response.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Record a meeting activity / timeline event in Crove CRM
   */
  public async recordBookingActivity(input: CroveCrmActivityInput): Promise<CroveCrmSyncResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "Crove CRM API key is not configured (CROVE_CRM_API_KEY)" };
    }

    const payload = {
      contact_email: input.contactEmail.toLowerCase().trim(),
      activity_type: input.activityType,
      booking_uid: input.bookingUid,
      title: input.title,
      start_time: input.startTime,
      end_time: input.endTime,
      organizer_email: input.organizerEmail,
      meeting_url: input.meetingUrl,
      notes: input.notes,
      organization_id: input.organizationId ? String(input.organizationId) : undefined,
      team_id: input.teamId ? String(input.teamId) : undefined,
      metadata: input.metadata || {},
    };

    try {
      const response = await fetch(`${this.baseUrl}/activities`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok || response.status === 200 || response.status === 201) {
        const json = await response.json().catch(() => ({}));
        return {
          success: true,
          activityId: json.id || json.data?.id,
        };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `Crove CRM API returned status ${response.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Sync complete booking event payload (Booking Created, Rescheduled, Cancelled)
   */
  public async syncBookingEvent(event: {
    triggerEvent: "BOOKING_CREATED" | "BOOKING_RESCHEDULED" | "BOOKING_CANCELLED" | string;
    payload: {
      uid?: string;
      title?: string;
      eventTitle?: string;
      startTime?: string;
      endTime?: string;
      status?: string;
      organizer?: { email: string; name?: string };
      attendees?: Array<{ email: string; name?: string; timeZone?: string; phoneNumber?: string }>;
      teamId?: string | number;
      organizationId?: string | number;
      metadata?: Record<string, unknown>;
    };
  }): Promise<{ success: boolean; syncedContacts: number; results: CroveCrmSyncResult[] }> {
    const attendees = event.payload.attendees || [];
    const meetingTitle = event.payload.eventTitle || event.payload.title || "Meeting";
    const bookingUid = event.payload.uid || `booking_${Date.now()}`;
    const organizerEmail = event.payload.organizer?.email || "organizer@crove.com";

    let activityType: CroveCrmActivityInput["activityType"] = "meeting_scheduled";
    if (event.triggerEvent === "BOOKING_RESCHEDULED") {
      activityType = "meeting_rescheduled";
    } else if (event.triggerEvent === "BOOKING_CANCELLED") {
      activityType = "meeting_cancelled";
    }

    const results: CroveCrmSyncResult[] = [];

    for (const attendee of attendees) {
      if (!attendee.email) continue;

      // 1. Upsert contact
      const contactRes = await this.upsertContact({
        email: attendee.email,
        name: attendee.name,
        phone: attendee.phoneNumber,
        timeZone: attendee.timeZone,
        organizationId: event.payload.organizationId,
        teamId: event.payload.teamId,
      });

      // 2. Record activity
      const activityRes = await this.recordBookingActivity({
        contactEmail: attendee.email,
        activityType,
        bookingUid,
        title: meetingTitle,
        startTime: event.payload.startTime || new Date().toISOString(),
        endTime: event.payload.endTime,
        organizerEmail,
        organizationId: event.payload.organizationId,
        teamId: event.payload.teamId,
        metadata: event.payload.metadata,
      });

      results.push({
        success: contactRes.success && activityRes.success,
        contactId: contactRes.contactId,
        activityId: activityRes.activityId,
        error: contactRes.error || activityRes.error,
      });
    }

    const successfulSyncs = results.filter((r) => r.success).length;
    return {
      success: results.length > 0 ? successfulSyncs === results.length : true,
      syncedContacts: successfulSyncs,
      results,
    };
  }
}
