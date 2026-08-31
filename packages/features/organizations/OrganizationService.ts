import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import slugify from "@calcom/lib/slugify";
import type { PrismaClient } from "@calcom/prisma";
import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

export interface UpdateOrgInput {
  orgId: number;
  userId: number;
  name?: string;
  slug?: string;
  bio?: string;
  logoUrl?: string;
  metadata?: Record<string, unknown>;
  lockEventTypeCreationForUsers?: boolean;
}

export interface CreateChildTeamInput {
  orgId: number;
  userId: number;
  name: string;
  slug?: string;
  description?: string;
}

export class OrganizationService {
  private db: PrismaClient;

  constructor(customPrisma?: PrismaClient) {
    this.db = customPrisma || prisma;
  }

  /**
   * Find all organizations where the user is a member or owner
   */
  async findUserOrganizations(params: { userId: number }) {
    const memberships = await this.db.membership.findMany({
      where: {
        userId: params.userId,
        accepted: true,
        team: {
          isOrganization: true,
        },
      },
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
            isOrganization: true,
            metadata: true,
            children: {
              select: {
                id: true,
                name: true,
                slug: true,
                members: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
            members: {
              select: {
                userId: true,
                role: true,
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
      userRole: m.role,
      memberCount: m.team.members.length,
      teamsCount: m.team.children.length,
      childTeams: m.team.children,
    }));
  }

  /**
   * Get organization details by ID
   */
  async getOrganizationById(params: { orgId: number; userId: number }) {
    const membership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: params.userId,
          teamId: params.orgId,
        },
      },
      select: { role: true, accepted: true },
    });

    const org = await this.db.team.findFirst({
      where: {
        id: params.orgId,
        isOrganization: true,
      },
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
        children: {
          select: {
            id: true,
            name: true,
            slug: true,
            bio: true,
            members: {
              select: {
                userId: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!org) {
      throw new Error(`Organization with ID ${params.orgId} not found`);
    }

    return {
      ...org,
      userRole: membership?.role || null,
      isMember: Boolean(membership?.accepted),
    };
  }

  /**
   * Update organization settings (Owner or Admin only)
   */
  async updateOrganization(input: UpdateOrgInput) {
    const membership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.orgId,
        },
      },
      select: { role: true },
    });

    if (
      !membership ||
      (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.ADMIN)
    ) {
      throw new Error("Unauthorized: Only Organization Owners or Admins can update organization settings.");
    }

    const data: Parameters<typeof this.db.team.update>[0]["data"] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = slugify(input.slug);
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
    if (input.metadata !== undefined) data.metadata = input.metadata;

    const updated = await this.db.team.update({
      where: { id: input.orgId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        logoUrl: true,
        metadata: true,
      },
    });

    return updated;
  }

  /**
   * Create a team inside an organization
   */
  async createTeamUnderOrg(input: CreateChildTeamInput) {
    const orgMembership = await this.db.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.orgId,
        },
      },
      select: { role: true },
    });

    if (
      !orgMembership ||
      (orgMembership.role !== MembershipRole.OWNER && orgMembership.role !== MembershipRole.ADMIN)
    ) {
      throw new Error("Unauthorized: You must be an Organization Owner or Admin to create sub-teams.");
    }

    const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
    let uniqueSlug = baseSlug;

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
        parentId: input.orgId,
        isOrganization: false,
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
        parentId: true,
      },
    });

    return team;
  }
}
