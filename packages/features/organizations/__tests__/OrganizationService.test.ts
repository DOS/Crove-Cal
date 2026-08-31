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
};

describe("OrganizationService", () => {
  let service: OrganizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrganizationService(mockPrisma as any);
  });

  test("findUserOrganizations should return organizations where user belongs", async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        role: MembershipRole.OWNER,
        accepted: true,
        team: {
          id: 100,
          name: "Crove Org",
          slug: "crove",
          isOrganization: true,
          children: [{ id: 101, name: "Sales", slug: "sales", members: [{ userId: 1 }] }],
          members: [{ userId: 1, role: MembershipRole.OWNER }],
        },
      },
    ]);

    const result = await service.findUserOrganizations({ userId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Crove Org");
    expect(result[0].teamsCount).toBe(1);
    expect(result[0].userRole).toBe(MembershipRole.OWNER);
  });

  test("createTeamUnderOrg should allow org owner to create sub-team", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({
      role: MembershipRole.OWNER,
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
});
