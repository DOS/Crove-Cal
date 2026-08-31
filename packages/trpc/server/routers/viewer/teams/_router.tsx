import { TeamService } from "@calcom/features/teams/TeamService";
import { MembershipRole } from "@calcom/prisma/enums";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";

export const ZGetTeamSchema = z.object({
  teamId: z.number(),
});

export const ZListTeamsSchema = z
  .object({
    includeOrgs: z.boolean().optional(),
  })
  .optional();

export const ZCreateTeamSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  parentId: z.number().nullable().optional(),
  isOrganization: z.boolean().optional(),
});

export const ZUpdateTeamSchema = z.object({
  teamId: z.number(),
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  bio: z.string().optional(),
  logoUrl: z.string().optional(),
  hideBookATeamMember: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ZDeleteTeamSchema = z.object({
  teamId: z.number(),
});

export const ZInviteMemberSchema = z.object({
  teamId: z.number(),
  email: z.string().email(),
  role: z.nativeEnum(MembershipRole).optional(),
});

export const ZChangeMemberRoleSchema = z.object({
  teamId: z.number(),
  targetUserId: z.number(),
  role: z.nativeEnum(MembershipRole),
});

export const ZRemoveMemberSchema = z.object({
  teamId: z.number(),
  targetUserId: z.number(),
});

export const viewerTeamsRouter = router({
  get: authedProcedure.input(ZGetTeamSchema).query(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.getTeamById({
      teamId: input.teamId,
      userId: ctx.user.id,
    });
  }),

  list: authedProcedure.input(ZListTeamsSchema).query(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.findUserTeams({
      userId: ctx.user.id,
      includeOrgs: input?.includeOrgs,
    });
  }),

  listOwnedTeams: authedProcedure.query(async ({ ctx }) => {
    const service = new TeamService(ctx.prisma);
    const teams = await service.findUserTeams({
      userId: ctx.user.id,
      includeOrgs: true,
    });
    return teams.filter((t) => t.role === MembershipRole.OWNER || t.role === MembershipRole.ADMIN);
  }),

  create: authedProcedure.input(ZCreateTeamSchema).mutation(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.createTeam({
      userId: ctx.user.id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      parentId: input.parentId,
      isOrganization: input.isOrganization,
    });
  }),

  update: authedProcedure.input(ZUpdateTeamSchema).mutation(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.updateTeam({
      teamId: input.teamId,
      userId: ctx.user.id,
      name: input.name,
      slug: input.slug,
      bio: input.bio,
      logoUrl: input.logoUrl,
      hideBookATeamMember: input.hideBookATeamMember,
      metadata: input.metadata,
    });
  }),

  delete: authedProcedure.input(ZDeleteTeamSchema).mutation(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.deleteTeam({
      teamId: input.teamId,
      userId: ctx.user.id,
    });
  }),

  inviteMember: authedProcedure.input(ZInviteMemberSchema).mutation(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.inviteMember({
      teamId: input.teamId,
      userId: ctx.user.id,
      email: input.email,
      role: input.role,
    });
  }),

  changeMemberRole: authedProcedure.input(ZChangeMemberRoleSchema).mutation(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.changeMemberRole({
      teamId: input.teamId,
      userId: ctx.user.id,
      targetUserId: input.targetUserId,
      role: input.role,
    });
  }),

  removeMember: authedProcedure.input(ZRemoveMemberSchema).mutation(async ({ ctx, input }) => {
    const service = new TeamService(ctx.prisma);
    return await service.removeMember({
      teamId: input.teamId,
      userId: ctx.user.id,
      targetUserId: input.targetUserId,
    });
  }),
});
