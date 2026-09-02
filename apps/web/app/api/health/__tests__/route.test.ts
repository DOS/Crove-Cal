import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, HEAD } from "../route";

vi.mock("@calcom/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}));

describe("API /api/health Endpoint", () => {
  it("should return 200 OK and healthy status when database is reachable", async () => {
    const prisma = (await import("@calcom/prisma")).default;
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }] as any);

    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("healthy");
    expect(json.service).toBe("crove-cal");
    expect(json.database.status).toBe("connected");
    expect(json.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(json.version).toBeDefined();
  });

  it("should return 503 Service Unavailable when database query fails", async () => {
    const prisma = (await import("@calcom/prisma")).default;
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("Connection refused to database pooler"));

    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("unhealthy");
    expect(json.database.status).toBe("disconnected");
    expect(json.database.error).toContain("Connection refused to database pooler");
  });

  it("should support HEAD requests", async () => {
    const prisma = (await import("@calcom/prisma")).default;
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }] as any);

    const req = new NextRequest("http://localhost:3000/api/health", { method: "HEAD" });
    const res = await HEAD(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
  });
});
