import { createHmac } from "node:crypto";
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  team: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  membership: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  profile: {
    upsert: vi.fn(),
  },
};

vi.mock("@calcom/prisma", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    generateProfileUid: vi.fn().mockReturnValue("mock-profile-uid-123"),
  },
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Headers;

    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers ?? {});
    }

    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return {
        status: init?.status ?? 200,
        headers: new Headers(init?.headers ?? {}),
        json: async () => data,
      };
    }
  }

  return {
    NextResponse: MockNextResponse,
  };
});

function createMockRequest(body: string, headers: Record<string, string> = {}) {
  const headerMap = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    headerMap.set(key.toLowerCase(), value);
  }

  return {
    text: async () => body,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) || null,
    },
  } as unknown as import("next/server").NextRequest;
}

function generateSignature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("/api/webhooks/dos-org-sync", () => {
  const SECRET = "test-webhook-secret-123456";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DOS_SYNC_WEBHOOK_SECRET = SECRET;
  });

  test("OPTIONS should return 204 with CORS headers", async () => {
    const { OPTIONS } = await import("../route");
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("POST should return 500 when webhook secret is missing", async () => {
    delete process.env.DOS_SYNC_WEBHOOK_SECRET;
    delete process.env.OIDC_CLIENT_SECRET;

    const { POST } = await import("../route");
    const body = JSON.stringify({ event: "test.ping" });
    const req = createMockRequest(body, { "x-dos-signature": "dummy" });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Webhook secret is not configured");
  });

  test("POST should return 401 when signature is missing or invalid", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify({ event: "test.ping" });
    const req = createMockRequest(body, { "x-dos-signature": "invalid-sig" });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid or missing signature");
  });

  test("POST should return 200 pong for test.ping event", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify({ event: "test.ping", timestamp: new Date().toISOString() });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": `sha256=${sig}` });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("pong");
  });

  test("POST should return 400 when org_id is missing for business events", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify({
      event: "organization.created",
      timestamp: new Date().toISOString(),
      data: {},
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing org_id in payload");
  });

  test("POST organization.created should create a new Team organization", async () => {
    const { POST } = await import("../route");
    mockPrisma.team.findFirst.mockResolvedValue(null);
    mockPrisma.team.create.mockResolvedValue({ id: 100, name: "Acme Corp", metadata: { dosOrgId: "org-1" } });

    const body = JSON.stringify({
      event: "organization.created",
      timestamp: new Date().toISOString(),
      data: {
        org_id: "org-1",
        org_name: "Acme Corp",
        org_slug: "acme-corp",
      },
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Acme Corp",
          isOrganization: true,
          metadata: { dosOrgId: "org-1" },
        }),
      })
    );
  });

  test("POST organization.updated should update existing team", async () => {
    const { POST } = await import("../route");
    mockPrisma.team.findFirst.mockResolvedValue({ id: 100, metadata: { dosOrgId: "org-1" } });
    mockPrisma.team.update.mockResolvedValue({ id: 100, name: "Acme Corp Updated" });

    const body = JSON.stringify({
      event: "org.updated",
      timestamp: new Date().toISOString(),
      data: {
        org_id: "org-1",
        org_name: "Acme Corp Updated",
      },
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.team.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          name: "Acme Corp Updated",
        }),
      })
    );
  });

  test("POST organization.member_added should upsert user, membership and profile", async () => {
    const { POST } = await import("../route");
    mockPrisma.team.findFirst.mockResolvedValue({ id: 100 });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 200, email: "member@acme.com", username: "member" });
    mockPrisma.membership.upsert.mockResolvedValue({});
    mockPrisma.profile.upsert.mockResolvedValue({});

    const body = JSON.stringify({
      event: "organization.member_added",
      timestamp: new Date().toISOString(),
      data: {
        org_id: "org-1",
        org_name: "Acme Corp",
        user_email: "member@acme.com",
        user_name: "Member Name",
        role: "ADMIN",
      },
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_teamId: {
            userId: 200,
            teamId: 100,
          },
        },
      })
    );
    expect(mockPrisma.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: {
            userId: 200,
            organizationId: 100,
          },
        },
      })
    );
  });

  test("POST organization.member_removed should delete user membership", async () => {
    const { POST } = await import("../route");
    mockPrisma.team.findFirst.mockResolvedValue({ id: 100 });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 200, email: "member@acme.com" });
    mockPrisma.membership.deleteMany.mockResolvedValue({ count: 1 });

    const body = JSON.stringify({
      event: "org.member_removed",
      timestamp: new Date().toISOString(),
      data: {
        org_id: "org-1",
        org_name: "Acme Corp",
        user_email: "member@acme.com",
      },
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.membership.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 200,
        teamId: 100,
      },
    });
  });

  test("POST organization.deleted should delete the Team", async () => {
    const { POST } = await import("../route");
    mockPrisma.team.findFirst.mockResolvedValue({ id: 100 });
    mockPrisma.team.delete.mockResolvedValue({ id: 100 });

    const body = JSON.stringify({
      event: "organization.deleted",
      timestamp: new Date().toISOString(),
      data: {
        org_id: "org-1",
        org_name: "Acme Corp",
      },
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.team.delete).toHaveBeenCalledWith({
      where: { id: 100 },
    });
  });

  test("POST team.created should create child team with parent organization", async () => {
    const { POST } = await import("../route");
    mockPrisma.team.findFirst.mockResolvedValueOnce({ id: 100, isOrganization: true }) // parent org
      .mockResolvedValueOnce(null) // child team not found
      .mockResolvedValueOnce(null); // slug check
    mockPrisma.team.create.mockResolvedValue({ id: 200, name: "Customer Support", parentId: 100 });

    const body = JSON.stringify({
      event: "team.created",
      timestamp: new Date().toISOString(),
      data: {
        org_id: "org-1",
        team_id: "team-101",
        team_name: "Customer Support",
        team_slug: "customer-support",
      },
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Customer Support",
          isOrganization: false,
          parentId: 100,
          metadata: { dosTeamId: "team-101", dosOrgId: "org-1" },
        }),
      })
    );
  });

  test("POST team.member_added should add member to child team", async () => {
    const { POST } = await import("../route");
    mockPrisma.team.findFirst.mockResolvedValueOnce({ id: 200, isOrganization: false }); // child team
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 50, email: "agent@acme.com" });
    mockPrisma.membership.upsert.mockResolvedValue({});

    const body = JSON.stringify({
      event: "team.member_added",
      timestamp: new Date().toISOString(),
      data: {
        org_id: "org-1",
        team_id: "team-101",
        user_email: "agent@acme.com",
        role: "LEAD",
      },
    });
    const sig = generateSignature(body, SECRET);
    const req = createMockRequest(body, { "x-dos-signature": sig });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_teamId: {
            userId: 50,
            teamId: 200,
          },
        },
        create: expect.objectContaining({
          role: "ADMIN",
        }),
      })
    );
  });
});
