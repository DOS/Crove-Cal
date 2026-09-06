import { WorkflowService } from "@calcom/features/workflows/lib/WorkflowService";
import {
  TimeUnit,
  WorkflowActions,
  WorkflowTemplates,
  WorkflowTriggerEvents,
} from "@calcom/prisma/enums";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";

export const ZWorkflowStepSchema = z.object({
  id: z.number().optional(),
  stepNumber: z.number().int(),
  action: z.nativeEnum(WorkflowActions),
  sendTo: z.string().nullable().optional(),
  reminderBody: z.string().nullable().optional(),
  emailSubject: z.string().nullable().optional(),
  template: z.nativeEnum(WorkflowTemplates).optional(),
  sender: z.string().nullable().optional(),
  numberRequired: z.boolean().nullable().optional(),
  includeCalendarEvent: z.boolean().optional(),
});

export const ZCreateWorkflowSchema = z.object({
  teamId: z.number().nullable().optional(),
  name: z.string().min(1),
  trigger: z.nativeEnum(WorkflowTriggerEvents),
  time: z.number().int().nullable().optional(),
  timeUnit: z.nativeEnum(TimeUnit).nullable().optional(),
  steps: z.array(ZWorkflowStepSchema).min(1),
  activeOn: z.array(z.number().int()).optional(),
  isOrganiserEvent: z.boolean().optional(),
});

export const ZUpdateWorkflowSchema = z.object({
  id: z.number().int(),
  teamId: z.number().nullable().optional(),
  name: z.string().min(1).optional(),
  trigger: z.nativeEnum(WorkflowTriggerEvents).optional(),
  time: z.number().int().nullable().optional(),
  timeUnit: z.nativeEnum(TimeUnit).nullable().optional(),
  active: z.boolean().optional(),
  steps: z.array(ZWorkflowStepSchema).optional(),
  activeOn: z.array(z.number().int()).optional(),
  isOrganiserEvent: z.boolean().optional(),
});

export const ZGetWorkflowSchema = z.object({
  id: z.number().int(),
  teamId: z.number().nullable().optional(),
});

export const ZListWorkflowsSchema = z
  .object({
    teamId: z.number().nullable().optional(),
  })
  .optional();

export const viewerWorkflowsRouter = router({
  list: authedProcedure.input(ZListWorkflowsSchema).query(async ({ ctx, input }) => {
    const service = new WorkflowService(ctx.prisma);
    return await service.getWorkflows({
      userId: ctx.user.id,
      teamId: input?.teamId ?? null,
    });
  }),

  get: authedProcedure.input(ZGetWorkflowSchema).query(async ({ ctx, input }) => {
    const service = new WorkflowService(ctx.prisma);
    return await service.getWorkflowById({
      id: input.id,
      userId: ctx.user.id,
      teamId: input.teamId ?? null,
    });
  }),

  create: authedProcedure.input(ZCreateWorkflowSchema).mutation(async ({ ctx, input }) => {
    const service = new WorkflowService(ctx.prisma);
    return await service.createWorkflow({
      userId: ctx.user.id,
      teamId: input.teamId ?? null,
      input,
    });
  }),

  update: authedProcedure.input(ZUpdateWorkflowSchema).mutation(async ({ ctx, input }) => {
    const service = new WorkflowService(ctx.prisma);
    return await service.updateWorkflow({
      id: input.id,
      userId: ctx.user.id,
      teamId: input.teamId ?? null,
      input,
    });
  }),

  delete: authedProcedure.input(ZGetWorkflowSchema).mutation(async ({ ctx, input }) => {
    const service = new WorkflowService(ctx.prisma);
    return await service.deleteWorkflow({
      id: input.id,
      userId: ctx.user.id,
      teamId: input.teamId ?? null,
    });
  }),

  duplicate: authedProcedure.input(ZGetWorkflowSchema).mutation(async ({ ctx, input }) => {
    const service = new WorkflowService(ctx.prisma);
    return await service.duplicateWorkflow({
      id: input.id,
      userId: ctx.user.id,
      teamId: input.teamId ?? null,
    });
  }),
});

export default viewerWorkflowsRouter;
