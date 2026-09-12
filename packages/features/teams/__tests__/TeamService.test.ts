import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
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
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  profile: {
    upsert: vi.fn(),
  },
  verificationToken: {
    create: vi.fn(),
  },
};

describe("TeamService", () => {
  let service: TeamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TeamService(mockPrisma as unknown as PrismaClient);
  });

  test("findUserTeams should query user memberships and format teams list", async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        role: MembershipRole.OWNER,
        team: {
          id: 1,
          name: "Engineering",
          slug: "eng",
          _count: { members: 1 },
          eventTypes: [{ id: 101, title: "Sprint Planning", slug: "sprint", length: 30 }],
        },
      },
    ]);

    const result = await service.findUserTeams({ userId: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Engineering");
    expect(result[0].memberCount).toBe(1);
    expect(result[0].role).toBe(MembershipRole.OWNER);
    expect(result[0]).not.toHaveProperty("members");
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

  test("createTeam should reject sub-team creation without parent membership", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(null);

    const error = await service.createTeam({ userId: 10, name: "Sub Team", parentId: 5 }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorWithCode);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
    expect(mockPrisma.team.create).not.toHaveBeenCalled();
  });

  test("createTeam should reject sub-team creation for plain members of the parent team", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
      accepted: true,
    });

    const error = await service.createTeam({ userId: 10, name: "Sub Team", parentId: 5 }).catch((e) => e);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
  });

  test("createTeam should allow sub-team creation for accepted parent admins", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.ADMIN,
      accepted: true,
    });
    mockPrisma.team.findFirst.mockResolvedValue(null);
    mockPrisma.team.create.mockResolvedValue({ id: 3, name: "Sub", slug: "sub", parentId: 5 });

    const result = await service.createTeam({ userId: 10, name: "Sub", parentId: 5 });
    expect(result.id).toBe(3);
  });

  test("createTeam should reject organization creation for non-admin users", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: UserPermissionRole.USER });

    const error = await service.createTeam({ userId: 10, name: "Org", isOrganization: true }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorWithCode);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
    expect(mockPrisma.team.create).not.toHaveBeenCalled();
  });

  test("createTeam should allow organization creation for instance admins", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: UserPermissionRole.ADMIN,
      username: "admin",
      email: "admin@crove.com",
    });
    mockPrisma.team.findFirst.mockResolvedValue(null);
    mockPrisma.team.create.mockResolvedValue({ id: 4, name: "Org", slug: "org", isOrganization: true });
    mockPrisma.profile.upsert.mockResolvedValue({});

    const result = await service.createTeam({ userId: 10, name: "Org", isOrganization: true });
    expect(result.id).toBe(4);
  });

  test("getTeamById should reject users without an accepted membership before fetching the team", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
      accepted: false,
    });

    const error = await service.getTeamById({ teamId: 1, userId: 20 }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorWithCode);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
  });

  test("getTeamById should throw NotFound when the team does not exist", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
      accepted: true,
    });
    mockPrisma.team.findUnique.mockResolvedValue(null);

    const error = await service.getTeamById({ teamId: 999, userId: 10 }).catch((e) => e);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.NotFound);
  });

  test("updateTeam should reject non-owner/admin updates", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
      accepted: true,
    });

    await expect(
      service.updateTeam({
        teamId: 1,
        userId: 20,
        name: "Hacked Team",
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("updateTeam should reject unaccepted members even if they are owners", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
      accepted: false,
    });

    const error = await service.updateTeam({ teamId: 1, userId: 10, name: "New Name" }).catch((e) => e);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
  });

  test("updateTeam should allow owner to update settings", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
      accepted: true,
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

  test("deleteTeam should reject non-owner members", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.ADMIN,
      accepted: true,
    });

    const error = await service.deleteTeam({ teamId: 1, userId: 20 }).catch((e) => e);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
    expect(mockPrisma.team.delete).not.toHaveBeenCalled();
  });

  test("deleteTeam should allow an accepted owner to delete the team", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
      accepted: true,
    });
    mockPrisma.team.delete.mockResolvedValue({ id: 1, name: "Eng", slug: "eng" });

    const result = await service.deleteTeam({ teamId: 1, userId: 10 });
    expect(result.id).toBe(1);
  });

  test("inviteMember should add an existing user and return an opaque INVITED result", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true }) // caller check
      .mockResolvedValueOnce(null); // target membership check

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 30,
      email: "colleague@crove.com",
      username: "colleague",
    });

    mockPrisma.membership.create.mockResolvedValue({});

    const result = await service.inviteMember({
      teamId: 1,
      userId: 10,
      email: "colleague@crove.com",
      role: MembershipRole.MEMBER,
    });

    expect(result).toEqual({ status: "INVITED" });
    expect(result).not.toHaveProperty("email");
    expect(mockPrisma.membership.create).toHaveBeenCalledWith({
      data: {
        userId: 30,
        teamId: 1,
        role: MembershipRole.MEMBER,
        accepted: true,
      },
    });
    expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
  });

  test("inviteMember should clamp the requested role to MEMBER for admin callers", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.ADMIN, accepted: true })
      .mockResolvedValueOnce(null);

    mockPrisma.user.findUnique.mockResolvedValue({ id: 30, email: "colleague@crove.com" });
    mockPrisma.membership.create.mockResolvedValue({});

    await service.inviteMember({
      teamId: 1,
      userId: 10,
      email: "colleague@crove.com",
      role: MembershipRole.OWNER,
    });

    expect(mockPrisma.membership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: MembershipRole.MEMBER,
      }),
    });
  });

  test("inviteMember should persist a verification token invitation for new users", async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      role: MembershipRole.OWNER,
      accepted: true,
    });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.verificationToken.create.mockResolvedValue({});

    const result = await service.inviteMember({
      teamId: 1,
      userId: 10,
      email: "NewUser@Crove.com",
    });

    expect(result).toEqual({ status: "INVITED" });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "newuser@crove.com" },
      select: { id: true, username: true, email: true },
    });
    expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: "newuser@crove.com",
        teamId: 1,
      }),
    });
    expect(mockPrisma.membership.create).not.toHaveBeenCalled();
  });

  test("inviteMember should reject users that are already members", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true })
      .mockResolvedValueOnce({ role: MembershipRole.MEMBER, accepted: true });

    mockPrisma.user.findUnique.mockResolvedValue({ id: 30, email: "colleague@crove.com" });

    const error = await service
      .inviteMember({
        teamId: 1,
        userId: 10,
        email: "colleague@crove.com",
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.BadRequest);
  });

  test("inviteMember should reject callers without an accepted membership", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
      accepted: false,
    });

    const error = await service
      .inviteMember({
        teamId: 1,
        userId: 20,
        email: "someone@crove.com",
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
  });

  test("changeMemberRole should reject demoting the last owner", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true }) // caller
      .mockResolvedValueOnce({ role: MembershipRole.OWNER }); // target
    mockPrisma.membership.count.mockResolvedValue(1);

    const error = await service
      .changeMemberRole({
        teamId: 1,
        userId: 10,
        targetUserId: 10,
        role: MembershipRole.MEMBER,
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.BadRequest);
    expect(mockPrisma.membership.update).not.toHaveBeenCalled();
  });

  test("changeMemberRole should throw NotFound for a missing target membership", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true })
      .mockResolvedValueOnce(null);

    const error = await service
      .changeMemberRole({
        teamId: 1,
        userId: 10,
        targetUserId: 99,
        role: MembershipRole.MEMBER,
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.NotFound);
  });

  test("removeMember should allow owner to remove team member", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.MEMBER }) // target
      .mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true }); // caller
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

  test("removeMember should prevent admins from removing an owner", async () => {
    mockPrisma.membership.findUnique
      .mockResolvedValueOnce({ role: MembershipRole.OWNER }) // target
      .mockResolvedValueOnce({ role: MembershipRole.ADMIN, accepted: true }); // caller

    const error = await service
      .removeMember({
        teamId: 1,
        userId: 20,
        targetUserId: 10,
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
    expect(mockPrisma.membership.delete).not.toHaveBeenCalled();
  });

  test("removeMember should prevent removing the last owner", async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({ role: MembershipRole.OWNER });
    mockPrisma.membership.count.mockResolvedValue(1);

    const error = await service
      .removeMember({
        teamId: 1,
        userId: 10,
        targetUserId: 10,
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.BadRequest);
    expect(mockPrisma.membership.delete).not.toHaveBeenCalled();
  });

  test("removeMember should throw NotFound when the target membership does not exist", async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce(null);

    const error = await service
      .removeMember({
        teamId: 1,
        userId: 10,
        targetUserId: 99,
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.NotFound);
  });
});
