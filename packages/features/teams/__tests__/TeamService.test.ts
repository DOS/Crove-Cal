import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TeamService } from "../TeamService";

const mockPrisma = {
  team: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  membership: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  profile: {
    upsert: vi.fn(),
  },
};

describe("TeamService", () => {
  let service: TeamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TeamService(mockPrisma as any);
  });

  test("findUserTeams should query user memberships and format teams list", async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        role: MembershipRole.OWNER,
        accepted: true,
        team: {
          id: 1,
          name: "Engineering",
          slug: "eng",
          members: [{ userId: 10, role: MembershipRole.OWNER, accepted: true }],
          eventTypes: [{ id: 101, title: "Sprint Planning", slug: "sprint", length: 30 }],
        },
      },
    ]);

    const result = await service.findUserTeams({ userId: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Engineering");
    expect(result[0].memberCount).toBe(1);
    expect(result[0].role).toBe(MembershipRole.OWNER);
  });

  test("createTeam should create a team with OWNER membership", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null);
    mockPrisma.team.create.mockResolvedValue({
      id: 2,
      name: "Marketing",
      slug: "marketing",
      isOrganization: false,
    });

    const result = await service.createTeam({
      userId: 10,
      name: "Marketing",
      slug: "marketing",
    });

    expect(result.id).toBe(2);
    expect(mockPrisma.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Marketing",
          slug: "marketing",
          members: {
            create: expect.objectContaining({
              userId: 10,
              role: MembershipRole.OWNER,
              accepted: true,
            }),
          },
        }),
      })
    );
  });

  test("updateTeam should reject non-owner/admin updates", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
    });

    await expect(
      service.updateTeam({
        teamId: 1,
        userId: 20,
        name: "Hacked Team",
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("updateTeam should allow owner to update settings", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
    });
    mockPrisma.team.update.mockResolvedValue({
      id: 1,
      name: "Engineering Updated",
      slug: "eng-updated",
    });

    const result = await service.updateTeam({
      teamId: 1,
      userId: 10,
      name: "Engineering Updated",
    });

    expect(result.name).toBe("Engineering Updated");
  });

  test("inviteMember should add existing user directly with membership", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.OWNER }) // caller check
      .mockResolvedValueOnce(null); // target membership check

    mockPrisma.user.findFirst.mockResolvedValue({
      id: 30,
      email: "colleague@crove.com",
      username: "colleague",
    });

    mockPrisma.membership.create.mockResolvedValue({
      role: MembershipRole.MEMBER,
      accepted: true,
      user: { id: 30, email: "colleague@crove.com" },
    });

    const result = await service.inviteMember({
      teamId: 1,
      userId: 10,
      email: "colleague@crove.com",
      role: MembershipRole.MEMBER,
    });

    expect(result.status).toBe("ADDED");
  });

  test("removeMember should allow owner to remove team member", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
    });
    mockPrisma.membership.delete.mockResolvedValue({});

    const result = await service.removeMember({
      teamId: 1,
      userId: 10,
      targetUserId: 30,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.membership.delete).toHaveBeenCalledWith({
      where: {
        userId_teamId: {
          userId: 30,
          teamId: 1,
        },
      },
    });
  });
});
