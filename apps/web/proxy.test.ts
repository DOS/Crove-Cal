// Import mocked functions

import { WEBAPP_URL } from "@calcom/lib/constants";
import { get as edgeConfigGet } from "@vercel/edge-config";
import { NextRequest, NextResponse } from "next/server";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// We'll test the wrapped proxy as it would be used in production
import proxy from "./proxy";
import { config } from "./proxy";

// Mock dependencies at module level
vi.mock("@vercel/edge-config", () => ({
  get: vi.fn(),
}));

// Mock NextResponse.json since it's not available in test environment
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");

  // Create a NextResponse constructor that returns Response objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NextResponse = function (body: any, init?: ResponseInit) {
    return new Response(body, init);
  };

  // Add static methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NextResponse.json = (body: any, init?: ResponseInit) => {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: {
        ...init?.headers,
        "content-type": "application/json",
      },
    });
  };

  NextResponse.next = (init?: ResponseInit) => {
    const response = new Response(null, {
      status: 200,
      ...init,
      headers: {
        ...init?.headers,
        "x-middleware-next": "1",
      },
    });

    // Add cookies property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any).cookies = {
      delete: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
    };

    return response;
  };

  NextResponse.rewrite = (url: URL | string, init?: ResponseInit) => {
    const rewriteUrl = typeof url === "string" ? new URL(url) : url;
    return new Response(null, {
      status: 200,
      ...init,
      headers: {
        ...init?.headers,
        "x-middleware-rewrite": rewriteUrl.toString(),
      },
    });
  };

  NextResponse.redirect = (url: URL | string, statusOrInit?: number | ResponseInit) => {
    const redirectUrl = typeof url === "string" ? new URL(url) : url;
    const status = typeof statusOrInit === "number" ? statusOrInit : statusOrInit?.status || 307;
    const init = typeof statusOrInit === "object" ? statusOrInit : {};

    const response = new Response(null, {
      ...init,
      status,
      headers: {
        ...init.headers,
        location: redirectUrl.toString(),
      },
    });

    // Add cookies property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any).cookies = {
      delete: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
    };

    return response;
  };

  return {
    ...actual,
    NextResponse,
  };
});

const createTestRequest = (overrides?: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}) => {
  const url = overrides?.url || `${WEBAPP_URL}/test-path`;
  const method = overrides?.method || "GET";
  const headers = new Headers(overrides?.headers || {});

  const req = new NextRequest(new Request(url, { method, headers }));

  // Add cookies if provided
  if (overrides?.cookies) {
    Object.entries(overrides.cookies).forEach(([name, value]) => {
      req.cookies.set(name, value);
    });
  }

  return req;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createEdgeConfigMock = (config: Record<string, any>) => {
  return (key: string) => {
    if (key in config) return Promise.resolve(config[key]);
    return Promise.resolve(undefined);
  };
};

// Helper to safely get header value
const getHeader = (res: Response, name: string) => {
  return res.headers.get(name);
};

// Helper to check response status
const expectStatus = (res: Response, status: number) => {
  expect(res.status).toBe(status);
};

// Wrapper for proxy calls to handle type casting
const callProxy = async (req: NextRequest): Promise<Response> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (proxy as any)(req)) as Response;
};

describe("Middleware Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set test environment
    vi.stubEnv("NEXT_PUBLIC_WEBAPP_URL", WEBAPP_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Static File Handling", () => {
    it("should skip processing for static files", async () => {
      const staticPaths = ["/images/logo.png", "/_next/static/main.js", "/favicon.ico"];

      for (const path of staticPaths) {
        const req = createTestRequest({ url: `${WEBAPP_URL}${path}` });
        const res = await callProxy(req);

        expect(res).toBeDefined();
        expectStatus(res, 200);
        expect(getHeader(res, "x-middleware-next")).toBe("1");
      }
    });
  });

  describe("Maintenance Mode", () => {
    it("should redirect to maintenance when enabled", async () => {
      (edgeConfigGet as Mock).mockImplementation(
        createEdgeConfigMock({
          isInMaintenanceMode: true,
        })
      );

      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test`,
      });

      const res = await callProxy(req);
      expect(res).toBeDefined();
      expectStatus(res, 200);
    });

    it("should not affect API routes in maintenance mode", async () => {
      (edgeConfigGet as Mock).mockImplementation(
        createEdgeConfigMock({
          isInMaintenanceMode: true,
        })
      );

      const req = createTestRequest({
        url: `${WEBAPP_URL}/api/bookings`,
      });

      const res = await callProxy(req);
      expect(res).toBeDefined();
      expectStatus(res, 200);
    });
  });

  describe("Signup Control", () => {
    it("should block signup when disabled", async () => {
      (edgeConfigGet as Mock).mockImplementation(
        createEdgeConfigMock({
          isSignupDisabled: true,
        })
      );

      const req = createTestRequest({
        url: `${WEBAPP_URL}/api/auth/signup`,
        method: "POST",
      });

      const res = await callProxy(req);
      expectStatus(res, 503);

      const body = await res.text();
      expect(body).toContain("Signup is disabled");
    });

    it("should allow signup when enabled", async () => {
      (edgeConfigGet as Mock).mockImplementation(
        createEdgeConfigMock({
          isSignupDisabled: false,
        })
      );

      const req = createTestRequest({
        url: `${WEBAPP_URL}/api/auth/signup`,
        method: "POST",
      });

      const res = await callProxy(req);
      expectStatus(res, 200);
    });
  });

  describe("Cookie Management", () => {
    it("should handle return-to cookie redirect", async () => {
      const returnUrl = "/dashboard";
      const req = createTestRequest({
        url: `${WEBAPP_URL}/apps/installed`,
        cookies: { "return-to": returnUrl },
      });

      const res = await callProxy(req);
      expectStatus(res, 307);
      expect(getHeader(res, "location")).toContain(returnUrl);
    });

    it("should not redirect without return-to cookie", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/apps/installed`,
      });

      const res = await callProxy(req);
      expectStatus(res, 200);
    });

    it("should delete session cookie on logout", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/auth/logout`,
      });

      const res = await callProxy(req);
      const setCookie = getHeader(res, "set-cookie");

      if (setCookie) {
        expect(setCookie).toContain("next-auth.session-token");
      }
    });
  });

  describe("Embed Routes", () => {
    it("should add embed headers", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test/embed`,
      });

      const res = await callProxy(req);
      expect(getHeader(res, "x-isEmbed")).toBe("true");
    });

    it("should add COEP header when requested", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test/embed?flag.coep=true`,
      });

      const res = await callProxy(req);
      expect(getHeader(res, "Cross-Origin-Embedder-Policy")).toBe("require-corp");
    });

    it("should add color scheme header", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test/embed?ui.color-scheme=dark`,
      });

      const res = await callProxy(req);
      expect(getHeader(res, "x-embedColorScheme")).toBe("dark");
    });
  });

  describe("CSP Headers", () => {
    beforeEach(() => {
      vi.stubEnv("CSP_POLICY", "strict");
      // Keep these tests independent of any local .env that configures dos-id,
      // otherwise /auth/login would take the auto-SSO redirect instead.
      vi.stubEnv("OIDC_CLIENT_ID", "");
      vi.stubEnv("OIDC_CLIENT_SECRET", "");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should add CSP headers to login pages", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/auth/login`,
      });

      const res = await callProxy(req);
      const cspHeader = getHeader(res, "content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toContain("default-src");
      expect(cspHeader).toContain("script-src");
    });

    it("should not add CSP headers to non-login pages", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test`,
      });

      const res = await callProxy(req);
      const cspHeader = getHeader(res, "content-security-policy");

      expect(cspHeader).toBeNull();
    });

    it("should add x-csp-status when CSP_POLICY not set", async () => {
      // Unset only CSP_POLICY; keep the OIDC stubs from beforeEach so this test
      // stays independent of any local dos-id configuration.
      vi.stubEnv("CSP_POLICY", "");

      const req = createTestRequest({
        url: `${WEBAPP_URL}/auth/login`,
      });

      const res = await callProxy(req);
      expect(getHeader(res, "x-csp-status")).toBe("not-opted-in");
    });
  });

  describe("Header sanitization", () => {
    it("sanitizes non-ASCII request header values to prevent Vercel Runtime Malformed Response Header", async () => {
      const spy = vi.spyOn(NextResponse, "next");

      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test`,
        // Next.js will translate request overrides into x-middleware-request-* headers internally
        headers: {
          "cf-region": "São Paulo", // contains non-ASCII "ã"
        },
      });

      const res = await callProxy(req);
      expectStatus(res, 200);

      // Assert that middleware forwarded sanitized ASCII-only value
      const initArg = (spy as unknown as Mock).mock.calls.at(-1)?.[0] as {
        request?: { headers?: Headers };
      };
      expect(initArg?.request?.headers).toBeDefined();

      const forwarded = initArg?.request?.headers as Headers;
      expect(forwarded.get("cf-region")).toBe("Sao Paulo");

      spy.mockRestore();
    });

    it("strips non-ASCII bytes in mojibake values (e.g., 'SÃ£o Paulo' -> 'So Paulo')", async () => {
      const spy = vi.spyOn(NextResponse, "next");

      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test`,
        headers: {
          "cf-region": "SÃ£o Paulo", // mojibake for "São Paulo"; includes non-ASCII bytes
        },
      });

      const res = await callProxy(req);
      expectStatus(res, 200);

      const initArg = (spy as unknown as Mock).mock.calls.at(-1)?.[0] as {
        request?: { headers?: Headers };
      };
      const forwarded = initArg?.request?.headers as Headers;
      expect(forwarded.get("cf-region")).toBe("So Paulo");

      spy.mockRestore();
    });
  });

  describe("Multiple Features", () => {
    it("should handle embed route with query params", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test/embed?ui.color-scheme=light`,
      });

      const res = await callProxy(req);
      expect(getHeader(res, "x-isEmbed")).toBe("true");
      expect(getHeader(res, "x-embedColorScheme")).toBe("light");
    });
  });

  describe("Error Handling", () => {
    it("should handle Edge Config errors gracefully", async () => {
      (edgeConfigGet as Mock).mockImplementation(() => {
        throw new Error("Config error");
      });

      const req = createTestRequest({
        url: `${WEBAPP_URL}/team/test`,
      });

      const res = await callProxy(req);
      expect(res).toBeDefined();
      expectStatus(res, 200);
    });

    it("should handle malformed URLs", async () => {
      const req = createTestRequest({
        url: `${WEBAPP_URL}//double-slash`,
      });

      const res = await callProxy(req);
      expect(res).toBeDefined();
    });
  });
});

describe("DOS ID auto-SSO redirect", () => {
  beforeEach(() => {
    vi.stubEnv("OIDC_CLIENT_ID", "test-client-id");
    vi.stubEnv("OIDC_CLIENT_SECRET", "test-client-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects /auth/login to /auth/sso when the dos-id provider is configured", async () => {
    const req = createTestRequest({ url: `${WEBAPP_URL}/auth/login` });

    const res = await callProxy(req);
    expectStatus(res, 307);
    const location = getHeader(res, "location") || "";
    expect(location).toContain("/auth/sso");
  });

  it("forwards callbackUrl to the SSO bridge", async () => {
    const req = createTestRequest({ url: `${WEBAPP_URL}/auth/login?callbackUrl=%2Fbooking%2F1` });

    const res = await callProxy(req);
    const location = getHeader(res, "location") || "";
    expect(location).toContain("/auth/sso");
    expect(location).toContain("callbackUrl=%2Fbooking%2F1");
  });

  it("wraps a bare invite token into the signup callbackUrl", async () => {
    const req = createTestRequest({ url: `${WEBAPP_URL}/auth/login?token=INVITE123` });

    const res = await callProxy(req);
    const location = getHeader(res, "location") || "";
    expect(location).toContain("callbackUrl=%2Fauth%2Fsignup%3Ftoken%3DINVITE123");
  });

  it("appends the invite token to an existing callbackUrl", async () => {
    const req = createTestRequest({
      url: `${WEBAPP_URL}/auth/login?callbackUrl=%2Fteams&token=INVITE123`,
    });

    const res = await callProxy(req);
    const location = getHeader(res, "location") || "";
    expect(location).toContain("callbackUrl=%2Fteams%3Ftoken%3DINVITE123");
  });

  it("keeps the classic form for ?direct=1 (break-glass)", async () => {
    const req = createTestRequest({ url: `${WEBAPP_URL}/auth/login?direct=1` });

    const res = await callProxy(req);
    expect(getHeader(res, "x-middleware-next")).toBe("1");
  });

  it("does not redirect when the dos-id provider is not configured", async () => {
    vi.stubEnv("OIDC_CLIENT_ID", "");
    vi.stubEnv("OIDC_CLIENT_SECRET", "");

    const req = createTestRequest({ url: `${WEBAPP_URL}/auth/login` });

    const res = await callProxy(req);
    expect(getHeader(res, "x-middleware-next")).toBe("1");
  });

  it("does not redirect non-login paths", async () => {
    const req = createTestRequest({ url: `${WEBAPP_URL}/auth/logout` });

    const res = await callProxy(req);
    expect(getHeader(res, "x-middleware-next")).toBe("1");
  });

  it("also covers the legacy /login alias", async () => {
    const req = createTestRequest({ url: `${WEBAPP_URL}/login` });

    const res = await callProxy(req);
    expectStatus(res, 307);
    expect(getHeader(res, "location")).toContain("/auth/sso");
  });

  it("does not bounce again when the loop guard cookie is present", async () => {
    const req = createTestRequest({
      url: `${WEBAPP_URL}/auth/login`,
      cookies: { "dos-sso-attempted": "1" },
    });

    const res = await callProxy(req);
    // Classic form renders instead of an infinite login->sso reload loop.
    expect(getHeader(res, "x-middleware-next")).toBe("1");
  });

  it("sets the loop guard cookie on the first SSO redirect", async () => {
    const req = createTestRequest({ url: `${WEBAPP_URL}/auth/login` });

    const res = await callProxy(req);
    // The mocked NextResponse.redirect does not serialize cookies into headers,
    // so assert on the cookie API call the middleware made instead.
    const setMock = (res as unknown as { cookies: { set: Mock } }).cookies.set;
    expect(setMock).toHaveBeenCalledWith(
      "dos-sso-attempted",
      "1",
      expect.objectContaining({ maxAge: 120 })
    );
  });
});

describe("Middleware Matcher Configuration", () => {
  const matcher: string[] = config.matcher;

  it("should include all core middleware routes", () => {
    expect(matcher).toContain("/auth/login");
    expect(matcher).toContain("/auth/logout");
    expect(matcher).toContain("/api/auth/signup");
    expect(matcher).toContain("/apps/installed");
    expect(matcher).toContain("/availability");
    expect(matcher).toContain("/login");
    expect(matcher).toContain("/:path*/embed");
  });

  it("should have no duplicate entries", () => {
    const uniqueEntries = new Set(matcher);
    expect(uniqueEntries.size).toBe(matcher.length);
  });

  it("should not contain any /api/ routes except /api/auth/signup", () => {
    const apiRoutes = matcher.filter((entry) => entry.startsWith("/api/") && entry !== "/api/auth/signup");
    expect(apiRoutes).toEqual([]);
  });

  it("should only contain the expected reduced route set", () => {
    expect(matcher).toEqual([
      "/auth/login",
      "/login",
      "/apps/installed",
      "/auth/logout",
      "/:path*/embed",
      "/availability",
      "/api/auth/signup",
    ]);
  });
});
