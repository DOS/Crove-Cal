import { createHmac, timingSafeEqual } from "node:crypto";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface DosWebhookPayload {
  event: "org.created" | "org.updated" | "org.deleted" | "org.member_added" | "org.member_removed";
  timestamp: string;
  data: {
    org_id: string;
    org_name: string;
    org_slug?: string;
    user_id?: string;
    user_email?: string;
    user_name?: string;
    role?: "OWNER" | "ADMIN" | "MEMBER" | string;
  };
}

function verifyHmacSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const signature = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;

  const expectedSignature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-dos-signature");
    const secret = process.env.DOS_SYNC_WEBHOOK_SECRET || process.env.OIDC_CLIENT_SECRET;

    if (secret && signature) {
      const isValid = verifyHmacSignature(rawBody, signature, secret);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload: DosWebhookPayload = JSON.parse(rawBody);
    const { event, data } = payload;

    if (!data?.org_id) {
      return NextResponse.json({ error: "Missing org_id in payload" }, { status: 400 });
    }

    const orgId = String(data.org_id);
    const orgName = data.org_name || "Default Organization";
    const orgSlug = data.org_slug ? slugify(data.org_slug) : slugify(orgName);

    switch (event) {
      case "org.created":
      case "org.updated": {
        let team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            OR: [{ metadata: { path: ["dosOrgId"], equals: orgId } }, { slug: orgSlug }],
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

      case "org.deleted": {
        const team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            OR: [{ metadata: { path: ["dosOrgId"], equals: orgId } }, { slug: orgSlug }],
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

      case "org.member_added": {
        let team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            OR: [{ metadata: { path: ["dosOrgId"], equals: orgId } }, { slug: orgSlug }],
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
        }
        break;
      }

      case "org.member_removed": {
        const team = await prisma.team.findFirst({
          where: {
            isOrganization: true,
            OR: [{ metadata: { path: ["dosOrgId"], equals: orgId } }, { slug: orgSlug }],
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

      default:
        return NextResponse.json({ message: `Ignored event: ${event}` }, { status: 200 });
    }

    return NextResponse.json({ success: true, event }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
