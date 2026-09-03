export interface CroveCrmContactInput {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  timeZone?: string;
  organizationId?: string | number;
  teamId?: string | number;
  customFields?: Record<string, unknown>;
  tags?: string[];
}

export interface CroveCrmActivityInput {
  contactEmail: string;
  activityType: "meeting_scheduled" | "meeting_rescheduled" | "meeting_cancelled" | "meeting_completed";
  bookingUid: string;
  title: string;
  startTime: string;
  endTime?: string;
  organizerEmail: string;
  meetingUrl?: string;
  notes?: string;
  organizationId?: string | number;
  teamId?: string | number;
  metadata?: Record<string, unknown>;
}

export interface CroveCrmSyncResult {
  success: boolean;
  contactId?: string;
  activityId?: string;
  error?: string;
}
