import { randomBytes } from "node:crypto";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { ErrorWithCode } from "@calcom/lib/errors";
import slugify from "@calcom/lib/slugify";
import type { Prisma, PrismaClient } from "@calcom/prisma";
import prisma from "@calcom/prisma";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";

export interface CreateTeamInput {
  userId: number;
  name: string;
  slug?: string;
  description?: string;
  parentId?: number | null;
  isOrganization?: boolean;
  metadata?: Prisma.InputJsonValue;
}

export interface UpdateTeamInput {
  teamId: number;
  userId: number;
  name?: string;
  slug?: string;
  bio?: string;
  logoUrl?: string;
  hideBookATeamMember?: boolean;
  metadata?: Prisma.InputJsonValue;
}

export interface InviteMemberInput {
  teamId: number;
  userId: number;
  email: string;
  role?: MembershipRole;
  sendEmail?: boolean;
}

export interface ChangeRoleInput {
  teamId: number;
  userId: number;
  targetUserId: number;
  role: MembershipRole;
}

export interface RemoveMemberInput {
  teamId: number;
  userId: number;
  targetUserId: number;
}

export class TeamService {
  private db: PrismaClient;

  constructor(customPrisma?: PrismaClient) {
    this.db = customPrisma || prisma;
  }

  /**
   * Find all teams and organizations where user is a member
   */
  async findUserTeams(params: { userId: number; includeOrgs?: boolean }) {
    const where: Prisma.MembershipWhereInput = {
      userId: params.userId,
      accepted: true,
    };

    if (!params.includeOrgs) {
      where.team = {
        isOrganization: false,
      };
    }

    const memberships = await this.db.membership.findMany({
      where,
      select: {
        role: true,
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            bio: true,
            hideBookATeamMember: true,
            isOrganization: true,
            parentId: true,
            metadata: true,
            _count: {
              select: {
                members: true,
              },
            },
            eventTypes: {
              where: { hidden: false },
              select: {
                id: true,
                title: true,
                slug: true,
                length: true,
              },
            },
          },
        },
      },
      orderBy: {
        team: {
          name: "asc",
        },
      },
    });

    return memberships.map((m) => ({
      ...m.team,
      role: m.role,
      memberCount: m.team._count.members,
    }));
  }

  /**
   * Get single team details by ID with permission validation
   */
  async getTeamById(params: { teamId: number; userId: number }) {
    const membership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: params.userId,
          teamId: params.teamId,
        },
      },
      select: { role: true, accepted: true },
    });

    if (!membership?.accepted) {
      throw ErrorWithCode.Factory.Forbidden("You do not have permission to view this team");
    }

    const team = await this.db.team.findUnique({
      where: { id: params.teamId },
      include: {
        members: {
          select: {
            role: true,
            accepted: true,
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
        eventTypes: {
          where: { hidden: false },
          select: {
            id: true,
            title: true,
            slug: true,
            length: true,
            hidden: true,
            description: true,
          },
        },
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!team) {
      throw ErrorWithCode.Factory.NotFound(`Team with ID ${params.teamId} not found`);
    }

    return {
      ...team,
      userRole: membership?.role || null,
      isMember: Boolean(membership?.accepted),
    };
  }

  /**
   * Create a new Team or Sub-Team
   */
  async createTeam(input: CreateTeamInput) {
    if (input.parentId) {
      const parentMembership = await this.db.membership.findUnique({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.parentId,
          },
        },
        select: { role: true, accepted: true },
      });

      if (
        !parentMembership?.accepted ||
        (parentMembership.role !== MembershipRole.OWNER && parentMembership.role !== MembershipRole.ADMIN)
      ) {
        throw ErrorWithCode.Factory.Forbidden(
          "You must be an Owner or Admin of the parent team to create a sub-team."
        );
      }
    }

    if (input.isOrganization) {
      const user = await this.db.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (user?.role !== UserPermissionRole.ADMIN) {
        throw ErrorWithCode.Factory.Forbidden("Only instance admins can create organizations.");
      }
    }

    const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
    let uniqueSlug = baseSlug;

    // Check slug uniqueness
    const existing = await this.db.team.findFirst({
      where: { slug: uniqueSlug },
      select: { id: true },
    });

    if (existing) {
      uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    const team = await this.db.team.create({
      data: {
        name: input.name,
        slug: uniqueSlug,
        bio: input.description || null,
        parentId: input.parentId || null,
        isOrganization: input.isOrganization || false,
        metadata: input.metadata || {},
        members: {
          create: {
            userId: input.userId,
            role: MembershipRole.OWNER,
            accepted: true,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isOrganization: true,
        parentId: true,
      },
    });

    // If this is an organization, create or link Profile
    if (input.isOrganization) {
      const user = await this.db.user.findUnique({
        where: { id: input.userId },
        select: { username: true, email: true },
      });
      const orgUsername = user?.username || user?.email.split("@")[0] || "user";

      await this.db.profile.upsert({
        create: {
          uid: ProfileRepository.generateProfileUid(),
          userId: input.userId,
          organizationId: team.id,
          username: orgUsername,
        },
        update: {
          username: orgUsername,
        },
        where: {
          userId_organizationId: {
            userId: input.userId,
            organizationId: team.id,
          },
        },
      });
    }

    return team;
  }

  /**
   * Update team attributes (Owner/Admin only)
   */
  async updateTeam(input: UpdateTeamInput) {
    const membership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.teamId,
        },
      },
      select: { role: true, accepted: true },
    });

    if (
      !membership?.accepted ||
      (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.ADMIN)
    ) {
      throw ErrorWithCode.Factory.Forbidden(
        "Unauthorized: Only Team Owners or Admins can update team settings."
      );
    }

    const data: Prisma.TeamUpdateArgs["data"] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = slugify(input.slug);
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
    if (input.hideBookATeamMember !== undefined) data.hideBookATeamMember = input.hideBookATeamMember;
    if (input.metadata !== undefined) data.metadata = input.metadata;

    const updated = await this.db.team.update({
      where: { id: input.teamId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        logoUrl: true,
        hideBookATeamMember: true,
        metadata: true,
      },
    });

    return updated;
  }

  /**
   * Delete a team (Owner only)
   */
  async deleteTeam(params: { teamId: number; userId: number }) {
    const membership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: params.userId,
          teamId: params.teamId,
        },
      },
      select: { role: true, accepted: true },
    });

    if (!membership?.accepted || membership.role !== MembershipRole.OWNER) {
      throw ErrorWithCode.Factory.Forbidden("Unauthorized: Only Team Owners can delete this team.");
    }

    const deleted = await this.db.team.delete({
      where: { id: params.teamId },
      select: { id: true, name: true, slug: true },
    });

    return deleted;
  }

  /**
   * Invite or add member to a team
   */
  async inviteMember(input: InviteMemberInput) {
    const callerMembership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.teamId,
        },
      },
      select: { role: true, accepted: true },
    });

    if (
      !callerMembership?.accepted ||
      (callerMembership.role !== MembershipRole.OWNER && callerMembership.role !== MembershipRole.ADMIN)
    ) {
      throw ErrorWithCode.Factory.Forbidden(
        "Unauthorized: Only Team Owners or Admins can invite new members."
      );
    }

    // Only Owners may grant elevated roles; Admins always invite as MEMBER
    const role =
      input.role && callerMembership.role === MembershipRole.OWNER ? input.role : MembershipRole.MEMBER;

    // Emails are stored canonical-lowercase; use the unique index instead of an insensitive search
    const email = input.email.toLowerCase().trim();

    const targetUser = await this.db.user.findUnique({
      where: { email },
      select: { id: true, username: true, email: true },
    });

    if (targetUser) {
      const existingMembership = await this.db.membership.findUnique({
        where: {
          userId_teamId: {
            userId: targetUser.id,
            teamId: input.teamId,
          },
        },
      });

      if (existingMembership) {
        throw ErrorWithCode.Factory.BadRequest("User is already a member of this team.");
      }

      await this.db.membership.create({
        data: {
          userId: targetUser.id,
          teamId: input.teamId,
          role,
          accepted: true,
        },
      });
    } else {
      // New user: persist an invitation so it survives beyond this request
      await this.db.verificationToken.create({
        data: {
          identifier: email,
          token: randomBytes(32).toString("hex"),
          expires: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          teamId: input.teamId,
        },
      });
    }

    // Both branches return the same opaque result so the endpoint cannot enumerate which emails have accounts
    return { status: "INVITED" };
  }

  /**
   * Change member role
   */
  async changeMemberRole(input: ChangeRoleInput) {
    const callerMembership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.teamId,
        },
      },
      select: { role: true, accepted: true },
    });

    if (!callerMembership?.accepted || callerMembership.role !== MembershipRole.OWNER) {
      throw ErrorWithCode.Factory.Forbidden("Unauthorized: Only Team Owners can change member roles.");
    }

    const targetMembership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.targetUserId,
          teamId: input.teamId,
        },
      },
      select: { role: true },
    });

    if (!targetMembership) {
      throw ErrorWithCode.Factory.NotFound("Membership not found");
    }

    if (targetMembership.role === MembershipRole.OWNER && input.role !== MembershipRole.OWNER) {
      const ownerCount = await this.db.membership.count({
        where: { teamId: input.teamId, role: MembershipRole.OWNER },
      });

      if (ownerCount <= 1) {
        throw ErrorWithCode.Factory.BadRequest("Cannot demote the last owner of this team.");
      }
    }

    const updated = await this.db.membership.update({
      where: {
        userId_teamId: {
          userId: input.targetUserId,
          teamId: input.teamId,
        },
      },
      data: {
        role: input.role,
      },
      select: {
        userId: true,
        teamId: true,
        role: true,
      },
    });

    return updated;
  }

  /**
   * Remove member from team
   */
  async removeMember(input: RemoveMemberInput) {
    const targetMembership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.targetUserId,
          teamId: input.teamId,
        },
      },
      select: { role: true },
    });

    if (!targetMembership) {
      throw ErrorWithCode.Factory.NotFound("Membership not found");
    }

    const isSelf = input.userId === input.targetUserId;

    if (!isSelf) {
      const callerMembership = await this.db.membership.findUnique({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.teamId,
          },
        },
        select: { role: true, accepted: true },
      });

      if (
        !callerMembership?.accepted ||
        (callerMembership.role !== MembershipRole.OWNER && callerMembership.role !== MembershipRole.ADMIN)
      ) {
        throw ErrorWithCode.Factory.Forbidden(
          "Unauthorized: Only Team Owners or Admins can remove other members."
        );
      }

      if (callerMembership.role === MembershipRole.ADMIN && targetMembership.role === MembershipRole.OWNER) {
        throw ErrorWithCode.Factory.Forbidden("Unauthorized: Only Team Owners can remove an Owner.");
      }
    }

    if (targetMembership.role === MembershipRole.OWNER) {
      const ownerCount = await this.db.membership.count({
        where: { teamId: input.teamId, role: MembershipRole.OWNER },
      });

      if (ownerCount <= 1) {
        throw ErrorWithCode.Factory.BadRequest("Cannot remove the last owner of this team.");
      }
    }

    await this.db.membership.delete({
      where: {
        userId_teamId: {
          userId: input.targetUserId,
          teamId: input.teamId,
        },
      },
    });

    return { success: true };
  }
}
