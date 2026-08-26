import type { PrismaClient } from "@calcom/prisma";

export interface ListEventTypesInput {
  username?: string;
  orgSlug?: string;
  userId?: number;
  limit?: number;
}

export async function listEventTypesHandler(prisma: PrismaClient, input: ListEventTypesInput) {
  const where: Parameters<typeof prisma.eventType.findMany>[0]["where"] = {
    hidden: false,
  };

  if (input.userId) {
    where.userId = input.userId;
  } else if (input.username) {
    where.users = {
      some: {
        username: input.username,
      },
    };
  }

  if (input.orgSlug) {
    where.team = {
      slug: input.orgSlug,
    };
  }

  const eventTypes = await prisma.eventType.findMany({
    where,
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      length: true,
      locations: true,
      periodType: true,
      timeZone: true,
      requiresConfirmation: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    take: input.limit || 50,
  });

  return eventTypes;
}

export interface GetEventTypeDetailsInput {
  eventTypeId?: number;
  slug?: string;
  username?: string;
}

export async function getEventTypeDetailsHandler(prisma: PrismaClient, input: GetEventTypeDetailsInput) {
  if (!input.eventTypeId && !input.slug) {
    throw new Error("Either eventTypeId or slug must be provided");
  }

  const where: Parameters<typeof prisma.eventType.findFirst>[0]["where"] = {};

  if (input.eventTypeId) {
    where.id = input.eventTypeId;
  } else if (input.slug) {
    where.slug = input.slug;
    if (input.username) {
      where.users = {
        some: {
          username: input.username,
        },
      };
    }
  }

  const eventType = await prisma.eventType.findFirst({
    where,
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      length: true,
      locations: true,
      periodType: true,
      timeZone: true,
      requiresConfirmation: true,
      bookingFields: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!eventType) {
    throw new Error("Event type not found");
  }

  return eventType;
}
