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

export interface DosTeamClaim {
  id?: string | number;
  org_id?: string | number;
  name?: string;
  role?: string;
  slug?: string;
}

export async function syncDosOrganizations(
  userId: number,
  organizations?: DosOrgClaim[],
  teams?: DosTeamClaim[],
  activeOrgId?: string | number
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, organizationId: true },
  });

  if (!user) return;

  let orgList = organizations;
  let teamList = teams;

  // Fallback to querying Supabase tables directly if claims were not injected into token
  if (!orgList || !Array.isArray(orgList) || orgList.length === 0) {
    try {
      const dbOrgs = await prisma.$queryRaw<DosOrgClaim[]>`
        SELECT om.org_id as id, o.name, o.slug, om.role
        FROM public.org_members om
        JOIN public.organizations o ON om.org_id = o.id
        JOIN auth.users u ON om.user_id = u.id
        WHERE u.email = ${user.email}
      `;
      if (dbOrgs && Array.isArray(dbOrgs) && dbOrgs.length > 0) {
        orgList = dbOrgs;
      }
    } catch {
      // ignore if table does not exist
    }
  }

  if (!teamList || !Array.isArray(teamList) || teamList.length === 0) {
    try {
      // Check for public.team_members / public.teams (or fallback to public.project_members / public.projects)
      const dbTeams = await prisma.$queryRaw<DosTeamClaim[]>`
        SELECT tm.team_id as id, t.org_id, t.name, t.slug, tm.role
        FROM public.team_members tm
        JOIN public.teams t ON tm.team_id = t.id
        JOIN auth.users u ON tm.user_id = u.id
        WHERE u.email = ${user.email}
      `;
      if (dbTeams && Array.isArray(dbTeams) && dbTeams.length > 0) {
        teamList = dbTeams;
      }
    } catch {
      try {
        const dbProjects = await prisma.$queryRaw<DosTeamClaim[]>`
          SELECT pm.project_id as id, p.org_id, p.name, p.slug, pm.role
          FROM public.project_members pm
          JOIN public.projects p ON pm.project_id = p.id
          JOIN auth.users u ON pm.user_id = u.id
          WHERE u.email = ${user.email}
        `;
        if (dbProjects && Array.isArray(dbProjects) && dbProjects.length > 0) {
          teamList = dbProjects;
        }
      } catch {
        // ignore fallback errors
      }
    }
  }

  const orgIdToDbTeamId = new Map<string, number>();

  // 1. Sync Organizations (Top-level Organization Teams)
  if (orgList && Array.isArray(orgList) && orgList.length > 0) {
    for (const org of orgList) {
      if (!org.id && !org.name) continue;

      const orgId = String(org.id || "");
      const orgName = org.name || "Default Organization";
      const orgSlug = org.slug ? slugify(org.slug) : slugify(orgName);

      let orgTeam = orgId
        ? await prisma.team.findFirst({
            where: {
              isOrganization: true,
              metadata: { path: ["dosOrgId"], equals: orgId },
            },
            select: { id: true, metadata: true },
          })
        : await prisma.team.findFirst({
            where: {
              isOrganization: true,
              slug: orgSlug,
            },
            select: { id: true, metadata: true },
          });

      if (!orgTeam) {
        let uniqueSlug = orgSlug;
        const existingSlugTeam = await prisma.team.findFirst({
          where: { slug: uniqueSlug },
          select: { id: true },
        });

        if (existingSlugTeam) {
          uniqueSlug = `${orgSlug}-${Math.random().toString(36).substring(2, 6)}`;
        }

        orgTeam = await prisma.team.create({
          data: {
            name: orgName,
            slug: uniqueSlug,
            isOrganization: true,
            metadata: {
              dosOrgId: orgId,
            },
          },
          select: { id: true, metadata: true },
        });
      } else {
        // Ensure dosOrgId is in metadata
        await prisma.team.update({
          where: { id: orgTeam.id },
          data: {
            name: orgName,
            metadata: {
              ...(typeof orgTeam.metadata === "object" && orgTeam.metadata ? orgTeam.metadata : {}),
              dosOrgId: orgId,
            },
          },
        });
      }

      if (orgId) {
        orgIdToDbTeamId.set(orgId, orgTeam.id);
      }

      const rawRole = (org.role || "").toUpperCase();
      const membershipRole =
        rawRole === "OWNER"
          ? MembershipRole.OWNER
          : rawRole === "ADMIN" || rawRole === "LEAD"
            ? MembershipRole.ADMIN
            : MembershipRole.MEMBER;

      await prisma.membership.upsert({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId: orgTeam.id,
          },
        },
        create: {
          userId: user.id,
          teamId: orgTeam.id,
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
          organizationId: orgTeam.id,
          username: orgUsername,
        },
        update: {
          username: orgUsername,
        },
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: orgTeam.id,
          },
        },
      });

      if (!user.organizationId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { organizationId: orgTeam.id },
        });
        user.organizationId = orgTeam.id;
      }
    }
  }

  // 2. Sync Sub-Teams under Organizations (Department / Team Hierarchy)
  if (teamList && Array.isArray(teamList) && teamList.length > 0) {
    for (const subTeam of teamList) {
      if (!subTeam.id && !subTeam.name) continue;

      const subTeamId = String(subTeam.id || "");
      const subTeamName = subTeam.name || "Default Team";
      const subTeamSlug = subTeam.slug ? slugify(subTeam.slug) : slugify(subTeamName);
      const parentOrgDosId = subTeam.org_id ? String(subTeam.org_id) : undefined;
      const parentOrgDbId = parentOrgDosId ? orgIdToDbTeamId.get(parentOrgDosId) : undefined;

      let childTeam = subTeamId
        ? await prisma.team.findFirst({
            where: {
              isOrganization: false,
              metadata: { path: ["dosTeamId"], equals: subTeamId },
            },
            select: { id: true, parentId: true },
          })
        : await prisma.team.findFirst({
            where: {
              isOrganization: false,
              slug: subTeamSlug,
              ...(parentOrgDbId ? { parentId: parentOrgDbId } : {}),
            },
            select: { id: true, parentId: true },
          });

      if (!childTeam) {
        let uniqueSlug = subTeamSlug;
        const existingSlugTeam = await prisma.team.findFirst({
          where: { slug: uniqueSlug, ...(parentOrgDbId ? { parentId: parentOrgDbId } : {}) },
          select: { id: true },
        });

        if (existingSlugTeam) {
          uniqueSlug = `${subTeamSlug}-${Math.random().toString(36).substring(2, 6)}`;
        }

        childTeam = await prisma.team.create({
          data: {
            name: subTeamName,
            slug: uniqueSlug,
            isOrganization: false,
            parentId: parentOrgDbId || null,
            metadata: {
              dosTeamId: subTeamId,
              dosOrgId: parentOrgDosId,
            },
          },
          select: { id: true, parentId: true },
        });
      } else if (parentOrgDbId && childTeam.parentId !== parentOrgDbId) {
        // Link to parent organization if previously unassigned
        await prisma.team.update({
          where: { id: childTeam.id },
          data: { parentId: parentOrgDbId },
        });
      }

      // Map LEAD / ADMIN -> ADMIN, MEMBER -> MEMBER
      const rawRole = (subTeam.role || "").toUpperCase();
      const teamRole =
        rawRole === "LEAD" || rawRole === "ADMIN" || rawRole === "OWNER"
          ? MembershipRole.ADMIN
          : MembershipRole.MEMBER;

      await prisma.membership.upsert({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId: childTeam.id,
          },
        },
        create: {
          userId: user.id,
          teamId: childTeam.id,
          role: teamRole,
          accepted: true,
        },
        update: {
          role: teamRole,
          accepted: true,
        },
      });
    }
  }

  // 3. Set Active Organization if specified in claims
  if (activeOrgId) {
    const activeDbOrgId = orgIdToDbTeamId.get(String(activeOrgId));
    if (activeDbOrgId && activeDbOrgId !== user.organizationId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: activeDbOrgId },
      });
    }
  }
}
