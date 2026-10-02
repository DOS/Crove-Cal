import { WorkflowActions, WorkflowMethods } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

import prisma from "@calcom/prisma";

import { dispatchDueReminders } from "../lib/reminderDispatcher";

vi.mock("@calcom/emails/email-manager", () => ({
  sendWorkflowReminderEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/prisma", () => {
  return {
    default: {
      workflowReminder: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

const dueReminder = {
  id: 1,
  method: WorkflowMethods.EMAIL,
  scheduledDate: new Date("2026-01-01T10:00:00Z"),
  workflowStep: {
    id: 11,
    action: WorkflowActions.EMAIL_ATTENDEE,
    sendTo: null,
    emailSubject: "Reminder: {{event_name}}",
    reminderBody: "Hi {{attendee_name}}, see you at {{event_time}} {{timezone}}",
  },
  booking: {
    uid: "booking-uid-1",
    title: "Booking title",
    startTime: new Date("2026-01-05T10:00:00Z"),
    endTime: new Date("2026-01-05T11:00:00Z"),
    location: "https://meet.example.com/abc",
    eventType: { title: "Mentoring session" },
    user: { email: "host@example.com", name: "Host" },
    attendees: [{ email: "booker@example.com", name: "Booker", timeZone: "Asia/Ho_Chi_Minh" }],
  },
};

describe("dispatchDueReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims due reminders and sends one email per attendee", async () => {
    vi.mocked(prisma.workflowReminder.findMany).mockResolvedValue([dueReminder]);
    vi.mocked(prisma.workflowReminder.updateMany).mockResolvedValue({ count: 1 });

    const result = await dispatchDueReminders({ method: WorkflowMethods.EMAIL });

    expect(result).toEqual({ found: 1, sent: 1, failed: 0 });
    expect(prisma.workflowReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scheduled: false, cancelled: false }),
        data: { scheduled: true },
      })
    );
    const { sendWorkflowReminderEmail } = await import("@calcom/emails/email-manager");
    expect(sendWorkflowReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "booker@example.com",
        subject: "Reminder: Mentoring session",
      })
    );
    const body = vi.mocked((await import("@calcom/emails/email-manager")).sendWorkflowReminderEmail).mock
      .calls[0][0].text;
    expect(body).toContain("Hi Booker");
    expect(body).toContain("Asia/Ho_Chi_Minh");
  });

  it("re-queues a reminder whose send fails instead of dropping it", async () => {
    vi.mocked(prisma.workflowReminder.findMany).mockResolvedValue([dueReminder]);
    vi.mocked(prisma.workflowReminder.updateMany).mockResolvedValue({ count: 1 });
    const { sendWorkflowReminderEmail } = await import("@calcom/emails/email-manager");
    vi.mocked(sendWorkflowReminderEmail).mockRejectedValueOnce(new Error("smtp down"));

    const result = await dispatchDueReminders({ method: WorkflowMethods.EMAIL });

    expect(result.failed).toBe(1);
    expect(prisma.workflowReminder.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { scheduled: false },
    });
  });

  it("returns zero when nothing is due", async () => {
    vi.mocked(prisma.workflowReminder.findMany).mockResolvedValue([]);

    const result = await dispatchDueReminders({ method: WorkflowMethods.EMAIL });

    expect(result).toEqual({ found: 0, sent: 0, failed: 0 });
    expect(prisma.workflowReminder.updateMany).not.toHaveBeenCalled();
  });
});
