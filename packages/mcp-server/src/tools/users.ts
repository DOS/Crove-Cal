import type { PrismaClient } from "@calcom/prisma";

export interface GetUserProfileInput {
  email?: string;
  username?: string;
  userId?: number;
}

export async function getUserProfileHandler(prisma: PrismaClient, input: GetUserProfileInput) {
  if (!input.email && !input.username && !input.userId) {
    throw new Error("Either email, username, or userId must be provided");
  }

  const where: Parameters<typeof prisma.user.findFirst>[0]["where"] = {};

  if (input.userId) {
    where.id = input.userId;
  } else if (input.email) {
    where.email = { equals: input.email, mode: "insensitive" };
  } else if (input.username) {
    where.username = input.username;
  }

  const user = await prisma.user.findFirst({
    where,
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      timeZone: true,
      weekStart: true,
      locale: true,
      avatarUrl: true,
      defaultScheduleId: true,
      teams: {
        select: {
          role: true,
          accepted: true,
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              isOrganization: true,
              metadata: true,
            },
          },
        },
      },
      profiles: {
        select: {
          id: true,
          uid: true,
          username: true,
          organizationId: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

export interface ListSchedulesInput {
  userId?: number;
  username?: string;
  email?: string;
}

export async function listSchedulesHandler(prisma: PrismaClient, input: ListSchedulesInput) {
  let targetUserId = input.userId;

  if (!targetUserId) {
    if (input.email || input.username) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            input.email ? { email: { equals: input.email, mode: "insensitive" } } : {},
            input.username ? { username: input.username } : {},
          ],
        },
        select: { id: true },
      });
      if (user) {
        targetUserId = user.id;
      }
    }
  }

  if (!targetUserId) {
    throw new Error("User not found or userId / username / email must be provided");
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      userId: targetUserId,
    },
    select: {
      id: true,
      name: true,
      timeZone: true,
      availability: {
        select: {
          id: true,
          days: true,
          startTime: true,
          endTime: true,
          date: true,
        },
      },
    },
  });

  return schedules;
}
