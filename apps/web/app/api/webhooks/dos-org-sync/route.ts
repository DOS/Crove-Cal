import { createHmac, timingSafeEqual } from "node:crypto";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { webhookMonitor } from "@calcom/lib/webhookMonitor";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface DosWebhookPayload {
  event:
    | "test.ping"
    | "ping"
    | "organization.created"
    | "org.created"
    | "organization.updated"
    | "org.updated"
    | "organization.deleted"
    | "org.deleted"
    | "organization.member_added"
    | "organization.member.added"
    | "org.member_added"
    | "organization.member_removed"
    | "organization.member.removed"
    | "org.member_removed"
    | "team.created"
    | "team.updated"
    | "team.deleted"
    | "team.member_added"
    | "team.member.added"
    | "team.member_removed"
    | "team.member.removed"
    | "user.updated";
  timestamp: string;
  data?: {
    org_id?: string;
    org_name?: string;
    org_slug?: string;
    team_id?: string | number;
    team_name?: string;
    team_slug?: string;
    name?: string;
    slug?: string;
    user_id?: string;
    user_email?: string;
    user_name?: string;
    role?: "OWNER" | "ADMIN" | "LEAD" | "MEMBER" | string;
    [key: string]: unknown;
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-dos-signature, x-dos-event, x-dos-delivery, x-dos-timestamp",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function verifyHmacSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const signature = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const expectedSignature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expectedBuffer.length || sigBuffer.length === 0) {
    return false;
  }

  return timingSafeEqual(sigBuffer, expectedBuffer);
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let eventName = "unknown";
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-dos-signature");
    const secret = process.env.DOS_SYNC_WEBHOOK_SECRET || process.env.OIDC_CLIENT_SECRET;

    if (!secret) {
      webhookMonitor.recordDelivery({
        source: "dos-org-sync",
        event: "error.unconfigured",
        status: 500,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Webhook secret is not configured",
      });
      return NextResponse.json(
        { error: "Webhook secret is not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!signature || !verifyHmacSignature(rawBody, signature, secret)) {
      webhookMonitor.recordDelivery({
        source: "dos-org-sync",
        event: "error.invalid_signature",
        status: 401,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Invalid or missing signature",
      });
      return NextResponse.json(
        { error: "Invalid or missing signature" },
        { status: 401, headers: corsHeaders }
      );
    }

    const payload: DosWebhookPayload = JSON.parse(rawBody);
    const { event, data } = payload;
    eventName = event;

    if (event === "test.ping" || event === "ping") {
      webhookMonitor.recordDelivery({
        source: "dos-org-sync",
        event: eventName,
        status: 200,
        latencyMs: Date.now() - startTime,
        success: true,
        summary: "Ping / Pong check",
      });
      return NextResponse.json(
        { success: true, message: "pong", timestamp: new Date().toISOString() },
        { status: 200, headers: corsHeaders }
      );
    }

    if (!data?.org_id) {
      webhookMonitor.recordDelivery({
        source: "dos-org-sync",
        event: eventName,
        status: 400,
        latencyMs: Date.now() - startTime,
        success: false,
        error: "Missing org_id in payload",
      });
      return NextResponse.json({ error: "Missing org_id in payload" }, { status: 400, headers: corsHeaders });
    }

    const orgId = String(data.org_id);
    const orgName = data.org_name || "Default Organization";
    const orgSlug = data.org_slug ? slugify(data.org_slug) : slugify(orgName);

    switch (event) {
      case "organization.created":
      case "org.created":
      case "organization.updated":
      case "org.updated": {
        let team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            metadata: { path: ["dosOrgId"], equals: orgId },
          },
          select: { id: true, metadata: true },
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
            select: { id: true, metadata: true },
          });
        } else {
          await prisma.team.update({
            where: { id: team.id },
            data: {
              name: orgName,
              metadata: {
                ...(typeof team.metadata === "object" && team.metadata ? team.metadata : {}),
                dosOrgId: orgId,
              },
            },
          });
        }
        break;
      }

      case "organization.deleted":
      case "org.deleted": {
        const team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            metadata: { path: ["dosOrgId"], equals: orgId },
          },
          select: { id: true },
        });

        if (team) {
          await prisma.team.delete({
            where: { id: team.id },
          });
        }
        break;
      }

      case "organization.member_added":
      case "organization.member.added":
      case "org.member_added": {
        let team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            metadata: { path: ["dosOrgId"], equals: orgId },
          },
          select: { id: true },
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
            select: { id: true },
          });
        }

        if (data.user_email) {
          let user = await prisma.user.findFirst({
            where: {
              email: {
                equals: data.user_email,
                mode: "insensitive",
              },
            },
            select: {
              id: true,
              email: true,
              username: true,
              organizationId: true,
            },
          });

          if (!user) {
            const newUsername =
              slugify(data.user_name || data.user_email.split("@")[0]) +
              `-${Math.random().toString(36).substring(2, 6)}`;
            user = await prisma.user.create({
              data: {
                email: data.user_email,
                name: data.user_name || data.user_email.split("@")[0],
                username: newUsername,
                emailVerified: new Date(),
                organizationId: team.id,
              },
              select: {
                id: true,
                email: true,
                username: true,
                organizationId: true,
              },
            });
          }

          const rawRole = (data.role || "").toUpperCase();
          const membershipRole =
            rawRole === "OWNER"
              ? MembershipRole.OWNER
              : rawRole === "ADMIN"
                ? MembershipRole.ADMIN
                : MembershipRole.MEMBER;

          await prisma.membership.upsert({
            where: {
              userId_teamId: {
                userId: user.id,
                teamId: team.id,
              },
            },
            create: {
              userId: user.id,
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
              where: { id: user.id },
              data: { organizationId: team.id },
            });
          }
        }
        break;
      }

      case "organization.member_removed":
      case "organization.member.removed":
      case "org.member_removed": {
        const team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            metadata: { path: ["dosOrgId"], equals: orgId },
          },
          select: { id: true },
        });

        if (team && data.user_email) {
          const user = await prisma.user.findFirst({
            where: {
              email: {
                equals: data.user_email,
                mode: "insensitive",
              },
            },
            select: { id: true },
          });

          if (user) {
            await prisma.membership.deleteMany({
              where: {
                userId: user.id,
                teamId: team.id,
              },
            });
          }
        }
        break;
      }

      case "team.created":
      case "team.updated": {
        const teamId = data.team_id ? String(data.team_id) : undefined;
        const teamName = data.team_name || data.name || "Default Team";
        const teamSlug = data.team_slug || data.slug ? slugify(String(data.team_slug || data.slug)) : slugify(teamName);

        const parentOrg = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            metadata: { path: ["dosOrgId"], equals: orgId },
          },
          select: { id: true },
        });

        let childTeam = teamId
          ? await prisma.team.findFirst({
              where: {
                isOrganization: false,
                metadata: { path: ["dosTeamId"], equals: teamId },
              },
              select: { id: true, parentId: true },
            })
          : await prisma.team.findFirst({
              where: {
                isOrganization: false,
                slug: teamSlug,
                ...(parentOrg ? { parentId: parentOrg.id } : {}),
              },
              select: { id: true, parentId: true },
            });

        if (!childTeam) {
          let uniqueSlug = teamSlug;
          const existingSlugTeam = await prisma.team.findFirst({
            where: { slug: uniqueSlug, ...(parentOrg ? { parentId: parentOrg.id } : {}) },
            select: { id: true },
          });

          if (existingSlugTeam) {
            uniqueSlug = `${teamSlug}-${Math.random().toString(36).substring(2, 6)}`;
          }

          childTeam = await prisma.team.create({
            data: {
              name: teamName,
              slug: uniqueSlug,
              isOrganization: false,
              parentId: parentOrg?.id || null,
              metadata: {
                dosTeamId: teamId,
                dosOrgId: orgId,
              },
            },
            select: { id: true, parentId: true },
          });
        } else {
          await prisma.team.update({
            where: { id: childTeam.id },
            data: {
              name: teamName,
              parentId: parentOrg?.id || childTeam.parentId,
              metadata: {
                dosTeamId: teamId,
                dosOrgId: orgId,
              },
            },
          });
        }
        break;
      }

      case "team.deleted": {
        const teamId = data.team_id ? String(data.team_id) : undefined;
        if (teamId) {
          await prisma.team.deleteMany({
            where: {
              isOrganization: false,
              metadata: { path: ["dosTeamId"], equals: teamId },
            },
          });
        }
        break;
      }

      case "team.member_added":
      case "team.member.added": {
        const teamId = data.team_id ? String(data.team_id) : undefined;
        let childTeam = teamId
          ? await prisma.team.findFirst({
              where: {
                isOrganization: false,
                metadata: { path: ["dosTeamId"], equals: teamId },
              },
              select: { id: true },
            })
          : null;

        if (childTeam && data.user_email) {
          const user = await prisma.user.findFirst({
            where: { email: { equals: data.user_email, mode: "insensitive" } },
            select: { id: true },
          });

          if (user) {
            const rawRole = (data.role || "").toUpperCase();
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
        break;
      }

      case "team.member_removed":
      case "team.member.removed": {
        const teamId = data.team_id ? String(data.team_id) : undefined;
        if (teamId && data.user_email) {
          const childTeam = await prisma.team.findFirst({
            where: {
              isOrganization: false,
              metadata: { path: ["dosTeamId"], equals: teamId },
            },
            select: { id: true },
          });

          const user = await prisma.user.findFirst({
            where: { email: { equals: data.user_email, mode: "insensitive" } },
            select: { id: true },
          });

          if (childTeam && user) {
            await prisma.membership.deleteMany({
              where: {
                userId: user.id,
                teamId: childTeam.id,
              },
            });
          }
        }
        break;
      }

      default:
        webhookMonitor.recordDelivery({
          source: "dos-org-sync",
          event: eventName,
          status: 200,
          latencyMs: Date.now() - startTime,
          success: true,
          summary: `Ignored event: ${event}`,
        });
        return NextResponse.json(
          { message: `Ignored event: ${event}` },
          { status: 200, headers: corsHeaders }
        );
    }

    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: eventName,
      status: 200,
      latencyMs: Date.now() - startTime,
      success: true,
      summary: `Successfully processed ${eventName}`,
    });

    return NextResponse.json({ success: true, event }, { status: 200, headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    webhookMonitor.recordDelivery({
      source: "dos-org-sync",
      event: eventName,
      status: 500,
      latencyMs: Date.now() - startTime,
      success: false,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
