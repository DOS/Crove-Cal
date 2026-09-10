import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

export interface ListEventTypesInput {
  /** Host user ID (tenant scope) — all returned event types belong to this user */
  userId: number;
  username?: string;
  orgSlug?: string;
  limit?: number;
}

export async function listEventTypesHandler(prisma: PrismaClient, input: ListEventTypesInput) {
  const where: Prisma.EventTypeWhereInput = {
    hidden: false,
    userId: input.userId,
  };

  if (input.username) {
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
  /** Host user ID (tenant scope) — the event type must belong to this user */
  userId: number;
  eventTypeId?: number;
  slug?: string;
  username?: string;
}

export async function getEventTypeDetailsHandler(prisma: PrismaClient, input: GetEventTypeDetailsInput) {
  if (!input.eventTypeId && !input.slug) {
    throw new Error("Either eventTypeId or slug must be provided");
  }

  const where: Prisma.EventTypeWhereInput = {
    userId: input.userId,
  };

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

export interface CreateEventTypeInput {
  /** Host user ID (tenant scope) — the new event type is created for this user */
  userId: number;
  username?: string;
  title: string;
  slug: string;
  length: number; // Duration in minutes
  description?: string;
  locations?: Array<{ type: string; link?: string; address?: string }>;
  requiresConfirmation?: boolean;
}

export async function createEventTypeHandler(prisma: PrismaClient, input: CreateEventTypeInput) {
  let targetUserId = input.userId;

  if (!targetUserId && input.username) {
    const user = await prisma.user.findFirst({
      where: { username: input.username },
      select: { id: true },
    });
    if (user) targetUserId = user.id;
  }

  if (!targetUserId) {
    throw new Error(
      "User ID is required to create an event type: provide userId or a username that resolves to an existing user"
    );
  }

  const newEventType = await prisma.eventType.create({
    data: {
      title: input.title,
      slug: input.slug,
      length: input.length,
      description: input.description || null,
      locations: input.locations || [{ type: "integrations:daily" }],
      requiresConfirmation: input.requiresConfirmation || false,
      userId: targetUserId,
      users: {
        connect: [{ id: targetUserId }],
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      length: true,
      description: true,
      locations: true,
      requiresConfirmation: true,
      userId: true,
    },
  });

  return newEventType;
}

export interface UpdateEventTypeInput {
  /** Host user ID (tenant scope) — updates are rejected unless the event type belongs to this user */
  userId: number;
  id: number;
  title?: string;
  slug?: string;
  length?: number;
  description?: string;
  requiresConfirmation?: boolean;
  hidden?: boolean;
}

export async function updateEventTypeHandler(prisma: PrismaClient, input: UpdateEventTypeInput) {
  const existing = await prisma.eventType.findFirst({
    where: { id: input.id, userId: input.userId },
    select: { id: true },
  });

  if (!existing) {
    throw new Error(`Event type with ID ${input.id} not found for user ${input.userId}`);
  }

  const updated = await prisma.eventType.update({
    where: { id: input.id, userId: input.userId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.length !== undefined ? { length: input.length } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.requiresConfirmation !== undefined
        ? { requiresConfirmation: input.requiresConfirmation }
        : {}),
      ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      length: true,
      description: true,
      requiresConfirmation: true,
      hidden: true,
    },
  });

  return updated;
}

export interface DeleteEventTypeInput {
  /** Host user ID (tenant scope) — deletes are rejected unless the event type belongs to this user */
  userId: number;
  id: number;
}

export async function deleteEventTypeHandler(prisma: PrismaClient, input: DeleteEventTypeInput) {
  const existing = await prisma.eventType.findFirst({
    where: { id: input.id, userId: input.userId },
    select: { id: true },
  });

  if (!existing) {
    throw new Error(`Event type with ID ${input.id} not found for user ${input.userId}`);
  }

  const deleted = await prisma.eventType.delete({
    where: { id: input.id, userId: input.userId },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });

  return deleted;
}
