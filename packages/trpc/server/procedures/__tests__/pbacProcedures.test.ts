import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionCheckService } from "../pbacProcedures";

const { mockMembershipFindFirst } = vi.hoisted(() => ({ mockMembershipFindFirst: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  default: {
    membership: {
      findFirst: mockMembershipFindFirst,
    },
  },
}));

describe("PermissionCheckService.checkPermission", () => {
  const service = new PermissionCheckService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when the user is not a member of the team", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);

    const hasPermission = await service.checkPermission({
      userId: 1,
      teamId: 5,
      permission: "booking.update",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER, MembershipRole.MEMBER],
    });

    expect(hasPermission).toBe(false);
  });

  it("returns true when the user has an accepted membership with a fallback role", async () => {
    mockMembershipFindFirst.mockResolvedValue({ id: 101 });

    const hasPermission = await service.checkPermission({
      userId: 1,
      teamId: 5,
      permission: "booking.update",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER, MembershipRole.MEMBER],
    });

    expect(hasPermission).toBe(true);
    expect(mockMembershipFindFirst).toHaveBeenCalledWith({
      where: {
        userId: 1,
        teamId: 5,
        accepted: true,
        role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER, MembershipRole.MEMBER] },
      },
      select: { id: true },
    });
  });

  it("returns false when the membership is not accepted", async () => {
    // The query filters on `accepted: true`, so an unaccepted membership never matches.
    mockMembershipFindFirst.mockResolvedValue(null);

    const hasPermission = await service.checkPermission({
      userId: 1,
      teamId: 5,
      permission: "booking.update",
      fallbackRoles: [MembershipRole.MEMBER],
    });

    expect(hasPermission).toBe(false);
    expect(mockMembershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 1,
          teamId: 5,
          accepted: true,
          role: { in: [MembershipRole.MEMBER] },
        }),
      })
    );
  });
});
