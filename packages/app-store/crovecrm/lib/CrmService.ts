import { CroveCrmService } from "@calcom/features/crove-crm";
import type { CalendarEvent, EventBusyDate, IntegrationCalendar } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { CRM, Contact, ContactCreateInput, CrmEvent } from "@calcom/types/CrmService";

export class CroveCrmIntegrationService implements CRM {
  private crm: CroveCrmService;
  private credential: CredentialPayload;

  constructor(credential: CredentialPayload) {
    this.credential = credential;
    const key = credential.key as { api_key?: string; api_url?: string } | undefined;
    this.crm = new CroveCrmService(key?.api_key, key?.api_url);
  }

  async createEvent(event: CalendarEvent, _contacts?: Contact[]): Promise<CrmEvent | undefined> {
    const result = await this.crm.syncBookingEvent({
      triggerEvent: "BOOKING_CREATED",
      payload: {
        uid: event.uid || undefined,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        organizer: event.organizer,
        attendees: event.attendees.map((a) => ({
          email: a.email,
          name: a.name,
          timeZone: a.timeZone,
        })),
      },
    });

    return {
      id: event.uid || `crovecrm_${Date.now()}`,
      uid: event.uid || undefined,
      type: "crovecrm",
      additionalInfo: result,
    };
  }

  async updateEvent(uid: string, event: CalendarEvent): Promise<CrmEvent> {
    const result = await this.crm.syncBookingEvent({
      triggerEvent: "BOOKING_RESCHEDULED",
      payload: {
        uid,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        organizer: event.organizer,
        attendees: event.attendees.map((a) => ({
          email: a.email,
          name: a.name,
          timeZone: a.timeZone,
        })),
      },
    });

    return {
      id: uid,
      uid,
      type: "crovecrm",
      additionalInfo: result,
    };
  }

  async deleteEvent(uid: string, event: CalendarEvent): Promise<void> {
    await this.crm.syncBookingEvent({
      triggerEvent: "BOOKING_CANCELLED",
      payload: {
        uid,
        title: event?.title || "Meeting",
        startTime: event?.startTime || new Date().toISOString(),
        endTime: event?.endTime,
        organizer: event?.organizer || { email: "host@crove.com" },
        attendees: event?.attendees?.map((a) => ({
          email: a.email,
          name: a.name,
          timeZone: a.timeZone,
        })) || [],
      },
    });
  }

  async getContacts(_options?: { emails: string | string[]; includeOwner?: boolean }): Promise<Contact[]> {
    return [];
  }

  async createContacts(
    contactsToCreate: ContactCreateInput[],
    _organizerEmail?: string
  ): Promise<Contact[]> {
    const created: Contact[] = [];
    for (const c of contactsToCreate) {
      if (c.email) {
        const res = await this.crm.upsertContact({
          email: c.email,
          name: c.name,
          phone: c.phone || undefined,
        });
        created.push({
          id: res.contactId || c.email,
          email: c.email,
        });
      }
    }
    return created;
  }

  getAppOptions() {
    return {};
  }

  async getAvailability(
    _dateFrom: string,
    _dateTo: string,
    _selectedCalendars: IntegrationCalendar[]
  ): Promise<EventBusyDate[]> {
    return [];
  }

  async listCalendars(_event?: CalendarEvent): Promise<IntegrationCalendar[]> {
    return [];
  }
}

export default function BuildCrmService(
  credential: CredentialPayload,
  _appOptions?: Record<string, unknown>
): CRM {
  return new CroveCrmIntegrationService(credential);
}
