import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import {
  TimeUnit,
  WorkflowActions,
  WorkflowMethods,
  WorkflowTemplates,
  WorkflowTriggerEvents,
} from "@calcom/prisma/enums";

export interface WorkflowStepInput {
  id?: number;
  stepNumber: number;
  action: WorkflowActions;
  sendTo?: string | null;
  reminderBody?: string | null;
  emailSubject?: string | null;
  template?: WorkflowTemplates;
  sender?: string | null;
  numberRequired?: boolean | null;
  includeCalendarEvent?: boolean;
}

export interface CreateWorkflowInput {
  name: string;
  trigger: WorkflowTriggerEvents;
  time?: number | null;
  timeUnit?: TimeUnit | null;
  steps: WorkflowStepInput[];
  activeOn?: number[];
  isOrganiserEvent?: boolean;
}

export interface UpdateWorkflowInput extends Partial<CreateWorkflowInput> {
  active?: boolean;
}

export class WorkflowService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get all workflows accessible to a user (personal + team workflows)
   */
  async getWorkflows({ userId, teamId }: { userId: number; teamId?: number | null }) {
    const where: Prisma.WorkflowWhereInput = teamId
      ? { teamId }
      : { userId, teamId: null };

    return this.prisma.workflow.findMany({
      where,
      include: {
        steps: {
          orderBy: { stepNumber: "asc" },
        },
        activeOn: {
          include: {
            eventType: {
              select: { id: true, title: true, slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single workflow by ID with security validation
   */
  async getWorkflowById({ id, userId, teamId }: { id: number; userId: number; teamId?: number | null }) {
    const where: Prisma.WorkflowWhereInput = teamId
      ? { id, teamId }
      : { id, userId };

    const workflow = await this.prisma.workflow.findFirst({
      where,
      include: {
        steps: {
          orderBy: { stepNumber: "asc" },
        },
        activeOn: {
          include: {
            eventType: {
              select: { id: true, title: true, slug: true },
            },
          },
        },
      },
    });

    if (!workflow) {
      throw new Error(`Workflow with ID ${id} not found or access denied`);
    }

    return workflow;
  }

  /**
   * Create a new automated Workflow with triggers, steps, and active event types
   */
  async createWorkflow({
    userId,
    teamId,
    input,
  }: {
    userId: number;
    teamId?: number | null;
    input: CreateWorkflowInput;
  }) {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Workflow name is required");
    }

    if (!input.steps || input.steps.length === 0) {
      throw new Error("At least one workflow action step is required");
    }

    return this.prisma.workflow.create({
      data: {
        name: input.name.trim(),
        trigger: input.trigger,
        time: input.time || null,
        timeUnit: input.timeUnit || null,
        isOrganiserEvent: input.isOrganiserEvent ?? false,
        active: true,
        user: teamId ? undefined : { connect: { id: userId } },
        team: teamId ? { connect: { id: teamId } } : undefined,
        steps: {
          create: input.steps.map((step, idx) => ({
            stepNumber: step.stepNumber || idx + 1,
            action: step.action,
            sendTo: step.sendTo || null,
            reminderBody: step.reminderBody || null,
            emailSubject: step.emailSubject || null,
            template: step.template || WorkflowTemplates.REMINDER,
            sender: step.sender || null,
            numberRequired: step.numberRequired || null,
            includeCalendarEvent: step.includeCalendarEvent ?? false,
          })),
        },
        activeOn: input.activeOn && input.activeOn.length > 0
          ? {
              create: input.activeOn.map((eventTypeId) => ({
                eventTypeId,
              })),
            }
          : undefined,
      },
      include: {
        steps: true,
        activeOn: true,
      },
    });
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow({
    id,
    userId,
    teamId,
    input,
  }: {
    id: number;
    userId: number;
    teamId?: number | null;
    input: UpdateWorkflowInput;
  }) {
    // Validate existence & ownership
    await this.getWorkflowById({ id, userId, teamId });

    // Handle steps replacement if provided
    if (input.steps) {
      await this.prisma.workflowStep.deleteMany({
        where: { workflowId: id },
      });
    }

    // Handle activeOn event types update if provided
    if (input.activeOn) {
      await this.prisma.workflowsOnEventTypes.deleteMany({
        where: { workflowId: id },
      });
    }

    return this.prisma.workflow.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
        ...(input.time !== undefined ? { time: input.time } : {}),
        ...(input.timeUnit !== undefined ? { timeUnit: input.timeUnit } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.isOrganiserEvent !== undefined ? { isOrganiserEvent: input.isOrganiserEvent } : {}),
        ...(input.steps
          ? {
              steps: {
                create: input.steps.map((step, idx) => ({
                  stepNumber: step.stepNumber || idx + 1,
                  action: step.action,
                  sendTo: step.sendTo || null,
                  reminderBody: step.reminderBody || null,
                  emailSubject: step.emailSubject || null,
                  template: step.template || WorkflowTemplates.REMINDER,
                  sender: step.sender || null,
                  numberRequired: step.numberRequired || null,
                  includeCalendarEvent: step.includeCalendarEvent ?? false,
                })),
              },
            }
          : {}),
        ...(input.activeOn
          ? {
              activeOn: {
                create: input.activeOn.map((eventTypeId) => ({
                  eventTypeId,
                })),
              },
            }
          : {}),
      },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        activeOn: {
          include: {
            eventType: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow({ id, userId, teamId }: { id: number; userId: number; teamId?: number | null }) {
    await this.getWorkflowById({ id, userId, teamId });
    return this.prisma.workflow.delete({
      where: { id },
    });
  }

  /**
   * Duplicate a workflow
   */
  async duplicateWorkflow({ id, userId, teamId }: { id: number; userId: number; teamId?: number | null }) {
    const original = await this.getWorkflowById({ id, userId, teamId });

    return this.createWorkflow({
      userId,
      teamId,
      input: {
        name: `${original.name} (Copy)`,
        trigger: original.trigger,
        time: original.time,
        timeUnit: original.timeUnit,
        isOrganiserEvent: original.isOrganiserEvent,
        steps: original.steps.map((s) => ({
          stepNumber: s.stepNumber,
          action: s.action,
          sendTo: s.sendTo,
          reminderBody: s.reminderBody,
          emailSubject: s.emailSubject,
          template: s.template,
          sender: s.sender,
          numberRequired: s.numberRequired,
          includeCalendarEvent: s.includeCalendarEvent,
        })),
        activeOn: original.activeOn.map((a) => a.eventTypeId),
      },
    });
  }

  /**
   * Calculate scheduledDate for a workflow trigger based on booking time
   */
  static calculateScheduledDate({
    trigger,
    startTime,
    endTime,
    time,
    timeUnit,
  }: {
    trigger: WorkflowTriggerEvents;
    startTime: Date;
    endTime: Date;
    time?: number | null;
    timeUnit?: TimeUnit | null;
  }): Date {
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();

    if (trigger === WorkflowTriggerEvents.NEW_EVENT || trigger === WorkflowTriggerEvents.EVENT_CANCELLED || trigger === WorkflowTriggerEvents.RESCHEDULE_EVENT) {
      return new Date(); // Send immediately
    }

    let offsetMs = 0;
    if (time && timeUnit) {
      switch (timeUnit) {
        case TimeUnit.DAY:
          offsetMs = time * 24 * 60 * 60 * 1000;
          break;
        case TimeUnit.HOUR:
          offsetMs = time * 60 * 60 * 1000;
          break;
        case TimeUnit.MINUTE:
          offsetMs = time * 60 * 1000;
          break;
      }
    }

    if (trigger === WorkflowTriggerEvents.BEFORE_EVENT) {
      return new Date(startMs - offsetMs);
    }

    if (trigger === WorkflowTriggerEvents.AFTER_EVENT) {
      return new Date(endMs + offsetMs);
    }

    return new Date();
  }

  /**
   * Schedule all workflow reminders for a newly created or rescheduled booking
   */
  async scheduleRemindersForBooking({
    bookingUid,
    eventTypeId,
    startTime,
    endTime,
    trigger = WorkflowTriggerEvents.BEFORE_EVENT,
  }: {
    bookingUid: string;
    eventTypeId: number;
    startTime: Date;
    endTime: Date;
    trigger?: WorkflowTriggerEvents;
  }) {
    // Find all active workflows associated with this eventType matching trigger
    const workflows = await this.prisma.workflow.findMany({
      where: {
        active: true,
        trigger,
        activeOn: {
          some: { eventTypeId },
        },
      },
      include: {
        steps: true,
      },
    });

    const createdReminders = [];

    for (const wf of workflows) {
      const scheduledDate = WorkflowService.calculateScheduledDate({
        trigger: wf.trigger,
        startTime,
        endTime,
        time: wf.time,
        timeUnit: wf.timeUnit,
      });

      for (const step of wf.steps) {
        let method: WorkflowMethods = WorkflowMethods.EMAIL;
        if (
          step.action === WorkflowActions.SMS_ATTENDEE ||
          step.action === WorkflowActions.SMS_NUMBER
        ) {
          method = WorkflowMethods.SMS;
        } else if (
          step.action === WorkflowActions.WHATSAPP_ATTENDEE ||
          step.action === WorkflowActions.WHATSAPP_NUMBER
        ) {
          method = WorkflowMethods.WHATSAPP;
        }

        const reminder = await this.prisma.workflowReminder.create({
          data: {
            bookingUid,
            workflowStepId: step.id,
            method,
            scheduledDate,
            scheduled: false,
            referenceId: `rem_${bookingUid}_${step.id}_${Date.now()}`,
          },
        });
        createdReminders.push(reminder);
      }
    }

    return createdReminders;
  }
}

export default WorkflowService;
