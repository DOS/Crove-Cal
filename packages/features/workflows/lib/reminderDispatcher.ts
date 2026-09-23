import { sendWorkflowReminderEmail } from "@calcom/emails/email-manager";
import { WorkflowActions, WorkflowMethods } from "@calcom/prisma/enums";

import prisma from "@calcom/prisma";

const batchLimit = 50;

type DueReminder = Awaited<ReturnType<typeof findDueReminders>>[number];

async function findDueReminders(method: WorkflowMethods, now: Date) {
  return prisma.workflowReminder.findMany({
    where: {
      method,
      scheduled: false,
      cancelled: false,
      scheduledDate: { lte: now },
    },
    include: {
      workflowStep: true,
      booking: {
        include: {
          attendees: true,
          user: true,
          eventType: true,
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
    take: batchLimit,
  });
}

const interpolate = (
  template: string,
  vars: Record<string, string>
): string =>
  Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template
  );

async function sendReminder(reminder: DueReminder) {
  const step = reminder.workflowStep;
  const booking = reminder.booking;

  if (!step || !booking) {
    // Reminder rows can outlive their step/booking (both relations cascade on
    // delete, so this only guards partially-seeded rows); nothing to send.
    return { sent: 0 };
  }

  const organizer = booking.user;
  const attendees = booking.attendees;
  const firstAttendee = attendees[0];

  const defaultSubject = "Reminder: {{event_name}} - {{event_date}}";
  const defaultBody =
    "Hi {{attendee_name}},\n\nThis is a reminder for your upcoming {{event_name}} with {{organizer_name}} on {{event_date}} at {{event_time}} ({{timezone}}).\n\n{{location}}";

  const recipients: string[] = [];
  if (step.action === WorkflowActions.EMAIL_ATTENDEE) {
    attendees.forEach((attendee) => recipients.push(attendee.email));
  } else if (step.action === WorkflowActions.EMAIL_HOST) {
    if (organizer?.email) recipients.push(organizer.email);
  } else if (step.action === WorkflowActions.EMAIL_ADDRESS) {
    if (step.sendTo) recipients.push(step.sendTo);
  } else {
    // SMS/WhatsApp steps belong to their own dispatchers; when this EMAIL
    // dispatcher meets one (or the SMS dispatcher runs without a provider),
    // throw so the reminder is re-queued instead of being marked as sent.
    throw new Error(`workflow-reminder: no sender for action ${step.action}`);
  }

  if (recipients.length === 0) {
    return { sent: 0 };
  }

  const vars: Record<string, string> = {
    event_name: booking.eventType?.title ?? booking.title ?? "",
    attendee_name: firstAttendee?.name ?? firstAttendee?.email ?? "",
    organizer_name: organizer?.name ?? organizer?.email ?? "",
    event_date: booking.startTime.toISOString().slice(0, 10),
    event_time: booking.startTime.toISOString().slice(11, 16),
    timezone: firstAttendee?.timeZone ?? "UTC",
    location: booking.location ?? "",
  };

  const subject = interpolate(step.emailSubject || defaultSubject, vars);
  const text = interpolate(step.reminderBody || defaultBody, vars);

  await Promise.all(
    recipients.map((to) => sendWorkflowReminderEmail({ to, subject, text }))
  );

  return { sent: recipients.length };
}

/**
 * Claims and sends due workflow reminders of one method.
 *
 * Rows are claimed atomically (scheduled=true) BEFORE sending so overlapping cron
 * invocations never double-send; a failed send re-queues the row (scheduled=false)
 * for the next tick, bounded by the per-reminder attempt already implicit in the
 * cron cadence.
 */
export async function dispatchDueReminders({
  method,
  now = new Date(),
}: {
  method: WorkflowMethods;
  now?: Date;
}) {
  const due = await findDueReminders(method, now);

  if (due.length === 0) {
    return { found: 0, sent: 0, failed: 0 };
  }

  const claim = await prisma.workflowReminder.updateMany({
    where: {
      id: { in: due.map((reminder) => reminder.id) },
      scheduled: false,
      cancelled: false,
    },
    data: { scheduled: true },
  });

  if (claim.count === 0) {
    return { found: due.length, sent: 0, failed: 0 };
  }

  let sent = 0;
  const failedIds: number[] = [];

  for (const reminder of due) {
    try {
      const result = await sendReminder(reminder);
      sent += result.sent;
    } catch (error) {
      failedIds.push(reminder.id);
      // Re-queue for the next tick instead of dropping the reminder.
      await prisma.workflowReminder.update({
        where: { id: reminder.id },
        data: { scheduled: false },
      });
      console.error("workflow-reminder:send-failed", reminder.id, error);
    }
  }

  return { found: due.length, sent, failed: failedIds.length };
}
