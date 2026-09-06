import { describe, expect, it, vi, beforeEach } from "vitest";
import { WorkflowService } from "../lib/WorkflowService";
import {
  TimeUnit,
  WorkflowActions,
  WorkflowMethods,
  WorkflowTemplates,
  WorkflowTriggerEvents,
} from "@calcom/prisma/enums";

describe("WorkflowService", () => {
  const mockPrisma: any = {
    workflow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workflowStep: {
      deleteMany: vi.fn(),
    },
    workflowsOnEventTypes: {
      deleteMany: vi.fn(),
    },
    workflowReminder: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateScheduledDate", () => {
    const startTime = new Date("2026-09-10T10:00:00.000Z");
    const endTime = new Date("2026-09-10T10:30:00.000Z");

    it("should calculate 24 hours before meeting correctly", () => {
      const scheduled = WorkflowService.calculateScheduledDate({
        trigger: WorkflowTriggerEvents.BEFORE_EVENT,
        startTime,
        endTime,
        time: 24,
        timeUnit: TimeUnit.HOUR,
      });

      expect(scheduled.toISOString()).toBe("2026-09-09T10:00:00.000Z");
    });

    it("should calculate 1 hour after meeting correctly", () => {
      const scheduled = WorkflowService.calculateScheduledDate({
        trigger: WorkflowTriggerEvents.AFTER_EVENT,
        startTime,
        endTime,
        time: 1,
        timeUnit: TimeUnit.HOUR,
      });

      expect(scheduled.toISOString()).toBe("2026-09-10T11:30:00.000Z");
    });

    it("should calculate immediate for NEW_EVENT", () => {
      const before = Date.now();
      const scheduled = WorkflowService.calculateScheduledDate({
        trigger: WorkflowTriggerEvents.NEW_EVENT,
        startTime,
        endTime,
      });
      const after = Date.now();

      expect(scheduled.getTime()).toBeGreaterThanOrEqual(before);
      expect(scheduled.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe("createWorkflow", () => {
    it("should create workflow with steps and activeOn event types", async () => {
      const service = new WorkflowService(mockPrisma);
      mockPrisma.workflow.create.mockResolvedValueOnce({
        id: 1,
        name: "24h Email Reminder",
        trigger: WorkflowTriggerEvents.BEFORE_EVENT,
        time: 24,
        timeUnit: TimeUnit.HOUR,
      });

      const result = await service.createWorkflow({
        userId: 10,
        teamId: null,
        input: {
          name: "24h Email Reminder",
          trigger: WorkflowTriggerEvents.BEFORE_EVENT,
          time: 24,
          timeUnit: TimeUnit.HOUR,
          steps: [
            {
              stepNumber: 1,
              action: WorkflowActions.EMAIL_ATTENDEE,
              emailSubject: "Reminder: Meeting tomorrow",
              reminderBody: "Hi {ATTENDEE_NAME}, see you tomorrow!",
            },
          ],
          activeOn: [101, 102],
        },
      });

      expect(result.id).toBe(1);
      expect(mockPrisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "24h Email Reminder",
            trigger: WorkflowTriggerEvents.BEFORE_EVENT,
            time: 24,
            timeUnit: TimeUnit.HOUR,
            user: { connect: { id: 10 } },
            steps: {
              create: [
                expect.objectContaining({
                  action: WorkflowActions.EMAIL_ATTENDEE,
                  emailSubject: "Reminder: Meeting tomorrow",
                }),
              ],
            },
            activeOn: {
              create: [{ eventTypeId: 101 }, { eventTypeId: 102 }],
            },
          }),
        })
      );
    });
  });

  describe("scheduleRemindersForBooking", () => {
    it("should find active workflows and create reminder records", async () => {
      const service = new WorkflowService(mockPrisma);
      mockPrisma.workflow.findMany.mockResolvedValueOnce([
        {
          id: 1,
          trigger: WorkflowTriggerEvents.BEFORE_EVENT,
          time: 1,
          timeUnit: TimeUnit.HOUR,
          steps: [
            { id: 10, stepNumber: 1, action: WorkflowActions.EMAIL_ATTENDEE },
            { id: 11, stepNumber: 2, action: WorkflowActions.SMS_ATTENDEE },
          ],
        },
      ]);
      mockPrisma.workflowReminder.create.mockImplementation(({ data }) => Promise.resolve({ id: Math.random(), ...data }));

      const reminders = await service.scheduleRemindersForBooking({
        bookingUid: "bk_123456",
        eventTypeId: 101,
        startTime: new Date("2026-09-10T15:00:00.000Z"),
        endTime: new Date("2026-09-10T15:30:00.000Z"),
      });

      expect(reminders).toHaveLength(2);
      expect(reminders[0].method).toBe(WorkflowMethods.EMAIL);
      expect(reminders[0].scheduledDate.toISOString()).toBe("2026-09-10T14:00:00.000Z");
      expect(reminders[1].method).toBe(WorkflowMethods.SMS);
    });
  });
});
