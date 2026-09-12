import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { OrganizationService } from "../OrganizationService";

const mockPrisma = {
  team: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  membership: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  organizationSettings: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
};

describe("OrganizationService", () => {
  let service: OrganizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(mockPrisma)
    );
    service = new OrganizationService(mockPrisma as unknown as PrismaClient);
  });

  test("findUserOrganizations should return organizations where user belongs", async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        role: MembershipRole.OWNER,
        team: {
          id: 100,
          name: "Crove Org",
          slug: "crove",
          isOrganization: true,
          _count: { members: 3, children: 1 },
          children: [{ id: 101, name: "Sales", slug: "sales" }],
        },
      },
    ]);

    const result = await service.findUserOrganizations({ userId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Crove Org");
    expect(result[0].memberCount).toBe(3);
    expect(result[0].teamsCount).toBe(1);
    expect(result[0].userRole).toBe(MembershipRole.OWNER);
    expect(result[0].childTeams).toEqual([{ id: 101, name: "Sales", slug: "sales" }]);
    expect(result[0]).not.toHaveProperty("members");
  });

  test("getOrganizationById should reject users without an accepted membership", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
      accepted: false,
    });

    const error = await service.getOrganizationById({ orgId: 100, userId: 2 }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorWithCode);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
    expect(mockPrisma.team.findFirst).not.toHaveBeenCalled();
  });

  test("getOrganizationById should throw NotFound when the organization does not exist", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
      accepted: true,
    });
    mockPrisma.team.findFirst.mockResolvedValue(null);

    const error = await service.getOrganizationById({ orgId: 999, userId: 1 }).catch((e) => e);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.NotFound);
  });

  test("updateOrganization should reject members without an accepted membership", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: MembershipRole.OWNER });

    const error = await service
      .updateOrganization({ orgId: 100, userId: 1, name: "New Org" })
      .catch((e) => e);
    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
  });

  test("updateOrganization should persist lockEventTypeCreationForUsers in organization settings", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
      accepted: true,
    });
    mockPrisma.team.update.mockResolvedValue({ id: 100, name: "Crove Org" });
    mockPrisma.organizationSettings.upsert.mockResolvedValue({});

    const result = await service.updateOrganization({
      orgId: 100,
      userId: 1,
      lockEventTypeCreationForUsers: true,
    });

    expect(result.id).toBe(100);
    expect(mockPrisma.organizationSettings.upsert).toHaveBeenCalledWith({
      where: { organizationId: 100 },
      update: { lockEventTypeCreationForUsers: true },
      create: {
        organizationId: 100,
        orgAutoAcceptEmail: "",
        lockEventTypeCreationForUsers: true,
      },
    });
  });

  test("createTeamUnderOrg should allow org owner to create sub-team", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
      accepted: true,
    });
    mockPrisma.team.findFirst.mockResolvedValue(null);
    mockPrisma.team.create.mockResolvedValue({
      id: 102,
      name: "Customer Success",
      slug: "cs",
      parentId: 100,
    });

    const result = await service.createTeamUnderOrg({
      orgId: 100,
      userId: 1,
      name: "Customer Success",
      slug: "cs",
    });

    expect(result.id).toBe(102);
    expect(mockPrisma.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: 100,
          isOrganization: false,
        }),
      })
    );
  });

  test("createTeamUnderOrg should reject unaccepted org members", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.ADMIN,
      accepted: false,
    });

    const error = await service
      .createTeamUnderOrg({
        orgId: 100,
        userId: 2,
        name: "New Sub Team",
      })
      .catch((e) => e);

    expect((error as ErrorWithCode).code).toBe(ErrorCode.Forbidden);
    expect(mockPrisma.team.create).not.toHaveBeenCalled();
  });
});
