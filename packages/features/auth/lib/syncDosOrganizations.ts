import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

export interface DosOrgClaim {
  id?: string | number;
  name?: string;
  role?: string;
  slug?: string;
}

export async function syncDosOrganizations(userId: number, organizations?: DosOrgClaim[]): Promise<void> {
  if (!organizations || !Array.isArray(organizations) || organizations.length === 0) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, organizationId: true },
  });

  if (!user) return;

  for (const org of organizations) {
    if (!org.id && !org.name) continue;

    const orgId = String(org.id || "");
    const orgName = org.name || "Default Organization";
    const orgSlug = org.slug ? slugify(org.slug) : slugify(orgName);

    let team = orgId
      ? await prisma.team.findFirst({
          where: {
            isOrganization: true,
            metadata: { path: ["dosOrgId"], equals: orgId },
          },
          select: {
            id: true,
          },
        })
      : await prisma.team.findFirst({
          where: {
            isOrganization: true,
            slug: orgSlug,
          },
          select: {
            id: true,
          },
        });

    if (!team) {
      let uniqueSlug = orgSlug;
      const existingSlugTeam = await prisma.team.findFirst({
        where: { slug: uniqueSlug },
        select: { id: true },
      });

      if (existingSlugTeam) {
        uniqueSlug = `${orgSlug}-${Math.random().toString(36).substring(2, 6)}`;
      }

      team = await prisma.team.create({
        data: {
          name: orgName,
          slug: uniqueSlug,
          isOrganization: true,
          metadata: {
            dosOrgId: orgId,
          },
        },
        select: {
          id: true,
        },
      });
    }

    const rawRole = (org.role || "").toUpperCase();
    const membershipRole =
      rawRole === "OWNER"
        ? MembershipRole.OWNER
        : rawRole === "ADMIN"
          ? MembershipRole.ADMIN
          : MembershipRole.MEMBER;

    await prisma.membership.upsert({
      where: {
        userId_teamId: {
          userId,
          teamId: team.id,
        },
      },
      create: {
        userId,
        teamId: team.id,
        role: membershipRole,
        accepted: true,
      },
      update: {
        role: membershipRole,
        accepted: true,
      },
    });

    const orgUsername = user.username || user.email.split("@")[0];
    await prisma.profile.upsert({
      create: {
        uid: ProfileRepository.generateProfileUid(),
        userId: user.id,
        organizationId: team.id,
        username: orgUsername,
      },
      update: {
        username: orgUsername,
      },
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: team.id,
        },
      },
    });

    if (!user.organizationId) {
      await prisma.user.update({
        where: { id: userId },
        data: { organizationId: team.id },
      });
      user.organizationId = team.id;
    }
  }
}
