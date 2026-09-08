import { describe, expect, it, vi, beforeEach } from "vitest";
import { ErrorWithCode } from "@calcom/lib/errors";
import { WorkflowService } from "../lib/WorkflowService";
import {
  MembershipRole,
  TimeUnit,
  WorkflowActions,
  WorkflowMethods,
  WorkflowTriggerEvents,
} from "@calcom/prisma/enums";

describe("WorkflowService", () => {
  const mockPrisma: any = {
    membership: {
      findFirst: vi.fn(),
    },
    eventType: {
      count: vi.fn(),
    },
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
    $transaction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // mockClear does not drop unconsumed mockResolvedValueOnce entries, so a test that
    // registers findMany but never triggers the call would leak its value into later tests
    mockPrisma.workflow.findMany.mockReset();
    mockPrisma.workflow.findFirst.mockReset();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(mockPrisma)
    );
    mockPrisma.membership.findFirst.mockResolvedValue({ id: 1, role: MembershipRole.OWNER });
    mockPrisma.eventType.count.mockImplementation(
      async ({ where }: { where: { id: { in: number[] } } }) => where.id.in.length
    );
    mockPrisma.workflow.create.mockReset();
    mockPrisma.workflow.create.mockResolvedValueOnce({ id: 1 });
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
    const validStep = {
      stepNumber: 1,
      action: WorkflowActions.EMAIL_ATTENDEE,
      emailSubject: "Reminder: Meeting tomorrow",
      reminderBody: "Hi {ATTENDEE_NAME}, see you tomorrow!",
    };

    it("should create workflow with steps and activeOn event types", async () => {
      const service = new WorkflowService(mockPrisma);

      const result = await service.createWorkflow({
        userId: 10,
        teamId: null,
        input: {
          name: "24h Email Reminder",
          trigger: WorkflowTriggerEvents.BEFORE_EVENT,
          time: 24,
          timeUnit: TimeUnit.HOUR,
          steps: [validStep],
          activeOn: [101, 102],
        },
      });

      expect(result.id).toBe(1);
      expect(mockPrisma.membership.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.eventType.count).toHaveBeenCalledWith({
        where: {
          id: { in: [101, 102] },
          OR: [{ userId: 10, teamId: null }],
        },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
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

    it("should create team workflow only for accepted ADMIN or OWNER members", async () => {
      mockPrisma.membership.findFirst.mockResolvedValueOnce({ id: 3, role: MembershipRole.ADMIN });
      const service = new WorkflowService(mockPrisma);

      const result = await service.createWorkflow({
        userId: 10,
        teamId: 5,
        input: {
          name: "Team workflow",
          trigger: WorkflowTriggerEvents.BEFORE_EVENT,
          steps: [validStep],
          activeOn: [101],
        },
      });

      expect(result.id).toBe(1);
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 10, teamId: 5, accepted: true },
        select: { id: true, role: true },
      });
      expect(mockPrisma.eventType.count).toHaveBeenCalledWith({
        where: {
          id: { in: [101] },
          OR: [{ userId: 10 }, { teamId: 5 }],
        },
      });
      expect(mockPrisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            team: { connect: { id: 5 } },
            user: undefined,
          }),
        })
      );
    });

    it("should throw Forbidden for team members without ADMIN or OWNER role", async () => {
      mockPrisma.membership.findFirst.mockResolvedValueOnce({ id: 3, role: MembershipRole.MEMBER });
      const service = new WorkflowService(mockPrisma);

      await expect(
        service.createWorkflow({
          userId: 10,
          teamId: 5,
          input: {
            name: "Team workflow",
            trigger: WorkflowTriggerEvents.BEFORE_EVENT,
            steps: [validStep],
          },
        })
      ).rejects.toThrow(/Only team owners and admins/);

      expect(mockPrisma.workflow.create).not.toHaveBeenCalled();
    });

    it("should throw Forbidden when the user is not an accepted team member", async () => {
      mockPrisma.membership.findFirst.mockResolvedValueOnce(null);
      const service = new WorkflowService(mockPrisma);

      await expect(
        service.createWorkflow({
          userId: 10,
          teamId: 5,
          input: {
            name: "Team workflow",
            trigger: WorkflowTriggerEvents.BEFORE_EVENT,
            steps: [validStep],
          },
        })
      ).rejects.toThrow(ErrorWithCode);

      expect(mockPrisma.workflow.create).not.toHaveBeenCalled();
    });

    it("should throw when activeOn references event types the user cannot access", async () => {
      mockPrisma.eventType.count.mockResolvedValueOnce(1);
      const service = new WorkflowService(mockPrisma);

      await expect(
        service.createWorkflow({
          userId: 10,
          teamId: null,
          input: {
            name: "Personal workflow",
            trigger: WorkflowTriggerEvents.BEFORE_EVENT,
            steps: [validStep],
            activeOn: [101, 202],
          },
        })
      ).rejects.toThrow(/Event type not found or not accessible/);

      expect(mockPrisma.workflow.create).not.toHaveBeenCalled();
    });
  });

  describe("getWorkflows", () => {
    it("should throw Forbidden when the user is not an accepted member of the team", async () => {
      mockPrisma.membership.findFirst.mockResolvedValueOnce(null);
      mockPrisma.workflow.findMany.mockResolvedValueOnce([]);
      const service = new WorkflowService(mockPrisma);

      await expect(service.getWorkflows({ userId: 10, teamId: 5 })).rejects.toThrow(
        /not a member of this team/
      );

      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 10, teamId: 5, accepted: true },
        select: { id: true, role: true },
      });
      expect(mockPrisma.workflow.findMany).not.toHaveBeenCalled();
    });

    it("should list personal workflows without a membership check", async () => {
      mockPrisma.workflow.findMany.mockResolvedValueOnce([]);
      const service = new WorkflowService(mockPrisma);

      await service.getWorkflows({ userId: 10, teamId: null });

      expect(mockPrisma.membership.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 10, teamId: null },
        })
      );
    });
  });

  describe("getWorkflowById", () => {
    it("should throw Forbidden when the user is not an accepted member of the team", async () => {
      mockPrisma.membership.findFirst.mockResolvedValueOnce(null);
      const service = new WorkflowService(mockPrisma);

      await expect(
        service.getWorkflowById({ id: 1, userId: 10, teamId: 5 })
      ).rejects.toThrow(/not a member of this team/);

      expect(mockPrisma.workflow.findFirst).not.toHaveBeenCalled();
    });

    it("should throw NotFound when the workflow does not exist or is not accessible", async () => {
      mockPrisma.workflow.findFirst.mockResolvedValueOnce(null);
      const service = new WorkflowService(mockPrisma);

      await expect(
        service.getWorkflowById({ id: 1, userId: 10, teamId: null })
      ).rejects.toThrow(/not found or access denied/);
    });
  });

  describe("updateWorkflow", () => {
    const validStep = {
      stepNumber: 1,
      action: WorkflowActions.EMAIL_ATTENDEE,
      emailSubject: "Reminder",
      reminderBody: "Hi {ATTENDEE_NAME}",
    };

    it("should wrap step and activeOn replacement with the update in a transaction scoped to the owner", async () => {
      mockPrisma.workflow.findFirst.mockResolvedValueOnce({ id: 1, userId: 10, teamId: null });
      mockPrisma.workflow.update.mockResolvedValueOnce({ id: 1 });
      const service = new WorkflowService(mockPrisma);

      const result = await service.updateWorkflow({
        id: 1,
        userId: 10,
        teamId: null,
        input: {
          name: "Renamed",
          trigger: WorkflowTriggerEvents.AFTER_EVENT,
          time: 15,
          timeUnit: TimeUnit.MINUTE,
          activeOn: [101, 102],
          steps: [validStep],
        },
      });

      expect(result.id).toBe(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.workflowStep.deleteMany).toHaveBeenCalledWith({ where: { workflowId: 1 } });
      expect(mockPrisma.workflowsOnEventTypes.deleteMany).toHaveBeenCalledWith({
        where: { workflowId: 1 },
      });
      expect(mockPrisma.eventType.count).toHaveBeenCalledWith({
        where: { id: { in: [101, 102] }, OR: [{ userId: 10, teamId: null }] },
      });
      expect(mockPrisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, userId: 10 },
          data: expect.objectContaining({ name: "Renamed", activeOn: { create: [{ eventTypeId: 101 }, { eventTypeId: 102 }] } }),
        })
      );
    });

    it("should scope team updates to the team and require ADMIN or OWNER", async () => {
      mockPrisma.membership.findFirst.mockResolvedValueOnce({ id: 3, role: MembershipRole.MEMBER });
      const service = new WorkflowService(mockPrisma);

      await expect(
        service.updateWorkflow({
          id: 1,
          userId: 10,
          teamId: 5,
          input: { active: false },
        })
      ).rejects.toThrow(/Only team owners and admins/);

      expect(mockPrisma.workflow.update).not.toHaveBeenCalled();
      expect(mockPrisma.workflow.findFirst).not.toHaveBeenCalled();
    });

    it("should scope team updates with the teamId in the where clause", async () => {
      mockPrisma.workflow.findFirst.mockResolvedValueOnce({ id: 1, userId: null, teamId: 5 });
      mockPrisma.workflow.update.mockResolvedValueOnce({ id: 1 });
      const service = new WorkflowService(mockPrisma);

      await service.updateWorkflow({
        id: 1,
        userId: 10,
        teamId: 5,
        input: { active: false },
      });

      expect(mockPrisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, teamId: 5 },
        })
      );
    });
  });

  describe("deleteWorkflow", () => {
    it("should scope the delete to the team workflow", async () => {
      mockPrisma.workflow.findFirst.mockResolvedValueOnce({ id: 1, userId: null, teamId: 5 });
      mockPrisma.workflow.delete.mockResolvedValueOnce({ id: 1 });
      const service = new WorkflowService(mockPrisma);

      await service.deleteWorkflow({ id: 1, userId: 10, teamId: 5 });

      expect(mockPrisma.workflow.delete).toHaveBeenCalledWith({ where: { id: 1, teamId: 5 } });
    });

    it("should scope the delete to the personal workflow", async () => {
      mockPrisma.workflow.findFirst.mockResolvedValueOnce({ id: 1, userId: 10, teamId: null });
      mockPrisma.workflow.delete.mockResolvedValueOnce({ id: 1 });
      const service = new WorkflowService(mockPrisma);

      await service.deleteWorkflow({ id: 1, userId: 10, teamId: null });

      expect(mockPrisma.workflow.delete).toHaveBeenCalledWith({ where: { id: 1, userId: 10 } });
    });

    it("should throw Forbidden for team members without ADMIN or OWNER role", async () => {
      mockPrisma.membership.findFirst.mockResolvedValueOnce({ id: 3, role: MembershipRole.MEMBER });
      const service = new WorkflowService(mockPrisma);

      await expect(
        service.deleteWorkflow({ id: 1, userId: 10, teamId: 5 })
      ).rejects.toThrow(/Only team owners and admins/);

      expect(mockPrisma.workflow.delete).not.toHaveBeenCalled();
    });
  });

  describe("scheduleRemindersForBooking", () => {
    it("should find active workflows and create reminder records", async () => {
      const service = new WorkflowService(mockPrisma);
      // mockResolvedValue (not Once) so a stale once-queue leaked from an earlier test cannot shadow this value
      mockPrisma.workflow.findMany.mockResolvedValue([
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
