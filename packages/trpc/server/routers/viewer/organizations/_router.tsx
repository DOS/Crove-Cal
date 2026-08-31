import { OrganizationService } from "@calcom/features/organizations/OrganizationService";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";

export const ZGetOrgSchema = z.object({
  orgId: z.number(),
});

export const ZUpdateOrgSchema = z.object({
  orgId: z.number(),
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  bio: z.string().optional(),
  logoUrl: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  lockEventTypeCreationForUsers: z.boolean().optional(),
});

export const ZCreateChildTeamSchema = z.object({
  orgId: z.number(),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
});

export const viewerOrganizationsRouter = router({
  listCurrent: authedProcedure.query(async ({ ctx }) => {
    const service = new OrganizationService(ctx.prisma);
    return await service.findUserOrganizations({
      userId: ctx.user.id,
    });
  }),

  get: authedProcedure.input(ZGetOrgSchema).query(async ({ ctx, input }) => {
    const service = new OrganizationService(ctx.prisma);
    return await service.getOrganizationById({
      orgId: input.orgId,
      userId: ctx.user.id,
    });
  }),

  update: authedProcedure.input(ZUpdateOrgSchema).mutation(async ({ ctx, input }) => {
    const service = new OrganizationService(ctx.prisma);
    return await service.updateOrganization({
      orgId: input.orgId,
      userId: ctx.user.id,
      name: input.name,
      slug: input.slug,
      bio: input.bio,
      logoUrl: input.logoUrl,
      metadata: input.metadata,
      lockEventTypeCreationForUsers: input.lockEventTypeCreationForUsers,
    });
  }),

  createChildTeam: authedProcedure.input(ZCreateChildTeamSchema).mutation(async ({ ctx, input }) => {
    const service = new OrganizationService(ctx.prisma);
    return await service.createTeamUnderOrg({
      orgId: input.orgId,
      userId: ctx.user.id,
      name: input.name,
      slug: input.slug,
      description: input.description,
    });
  }),
});
