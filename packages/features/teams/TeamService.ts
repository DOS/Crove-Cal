import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import slugify from "@calcom/lib/slugify";
import type { Prisma, PrismaClient } from "@calcom/prisma";
import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

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
        accepted: true,
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
            members: {
              select: {
                userId: true,
                role: true,
                accepted: true,
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
      memberCount: m.team.members.length,
      members: m.team.members,
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
      throw new Error(`Team with ID ${params.teamId} not found`);
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
      select: { role: true },
    });

    if (
      !membership ||
      (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.ADMIN)
    ) {
      throw new Error("Unauthorized: Only Team Owners or Admins can update team settings.");
    }

    const data: Parameters<typeof this.db.team.update>[0]["data"] = {};
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
      select: { role: true },
    });

    if (!membership || membership.role !== MembershipRole.OWNER) {
      throw new Error("Unauthorized: Only Team Owners can delete this team.");
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
      select: { role: true },
    });

    if (
      !callerMembership ||
      (callerMembership.role !== MembershipRole.OWNER && callerMembership.role !== MembershipRole.ADMIN)
    ) {
      throw new Error("Unauthorized: Only Team Owners or Admins can invite new members.");
    }

    const targetUser = await this.db.user.findFirst({
      where: {
        email: { equals: input.email, mode: "insensitive" },
      },
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
        throw new Error("User is already a member of this team.");
      }

      const membership = await this.db.membership.create({
        data: {
          userId: targetUser.id,
          teamId: input.teamId,
          role: input.role || MembershipRole.MEMBER,
          accepted: true,
        },
        select: {
          role: true,
          accepted: true,
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      });

      return { status: "ADDED", membership };
    }

    return { status: "INVITED", email: input.email };
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
      select: { role: true },
    });

    if (!callerMembership || callerMembership.role !== MembershipRole.OWNER) {
      throw new Error("Unauthorized: Only Team Owners can change member roles.");
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
    const isSelf = input.userId === input.targetUserId;

    if (!isSelf) {
      const callerMembership = await this.db.membership.findUnique({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.teamId,
          },
        },
        select: { role: true },
      });

      if (
        !callerMembership ||
        (callerMembership.role !== MembershipRole.OWNER && callerMembership.role !== MembershipRole.ADMIN)
      ) {
        throw new Error("Unauthorized: Only Team Owners or Admins can remove other members.");
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
