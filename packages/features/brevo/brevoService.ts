export interface BrevoContactInput {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  meetingTitle?: string;
  meetingStart?: string;
  meetingStatus?: "ACCEPTED" | "CANCELLED" | "RESCHEDULED" | "PENDING" | string;
  timeZone?: string;
  listIds?: number[];
  customAttributes?: Record<string, unknown>;
}

export interface BrevoEventInput {
  eventName: "meeting_booked" | "meeting_cancelled" | "meeting_rescheduled" | string;
  email: string;
  properties?: Record<string, unknown>;
}

export class BrevoService {
  private apiKey: string;
  private baseUrl = "https://api.brevo.com/v3";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CROVE_BREVO_API_KEY || process.env.BREVO_API_KEY || "";
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Upsert contact into Brevo CRM with meeting attributes
   */
  public async upsertContact(
    input: BrevoContactInput
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Brevo API key is not configured" };
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

    const attributes: Record<string, unknown> = {
      ...(firstName ? { FIRSTNAME: firstName } : {}),
      ...(lastName ? { LASTNAME: lastName } : {}),
      ...(input.meetingTitle ? { LAST_MEETING_TITLE: input.meetingTitle } : {}),
      ...(input.meetingStart ? { LAST_MEETING_START: input.meetingStart } : {}),
      ...(input.meetingStatus ? { LAST_MEETING_STATUS: input.meetingStatus } : {}),
      ...(input.timeZone ? { TIMEZONE: input.timeZone } : {}),
      ...(input.customAttributes || {}),
    };

    const body: Record<string, unknown> = {
      email: input.email.toLowerCase().trim(),
      attributes,
      updateEnabled: true,
    };

    if (input.listIds && input.listIds.length > 0) {
      body.listIds = input.listIds;
    }

    try {
      const response = await fetch(`${this.baseUrl}/contacts`, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      // 201 Created or 204 No Content (when updateEnabled is true) are both successes
      if (response.status === 201 || response.status === 204) {
        let data: unknown = null;
        try {
          data = await response.json();
        } catch {
          data = { status: response.status };
        }
        return { success: true, data };
      }

      // Handle already existing contact error or update
      const errorJson = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      return {
        success: false,
        error: errorJson.message || `Brevo API returned status ${response.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Track transactional event in Brevo for Marketing Automation workflows
   */
  public async trackEvent(
    input: BrevoEventInput
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Brevo API key is not configured" };
    }

    const body = {
      event_name: input.eventName,
      identifiers: {
        email_id: input.email.toLowerCase().trim(),
      },
      event_properties: input.properties || {},
    };

    try {
      const response = await fetch(`${this.baseUrl}/events`, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.ok || response.status === 204 || response.status === 201) {
        return { success: true };
      }

      const errorJson = (await response.json().catch(() => ({}))) as { message?: string };
      return {
        success: false,
        error: errorJson.message || `Brevo Event API returned status ${response.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
