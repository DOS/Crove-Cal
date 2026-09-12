import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
}));

import { assertCronSecret } from "../cronAuth";

function requestWith(headers: Record<string, string>, url = "http://localhost/api/cron/test") {
  return new Request(url, { headers });
}

describe("assertCronSecret", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("CRON_API_KEY", "");
  });

  it("passes with a valid Bearer CRON_SECRET", () => {
    const request = requestWith({ authorization: "Bearer test-cron-secret" });
    expect(assertCronSecret(request)).toBeNull();
  });

  it("passes with a case-insensitive bearer scheme and header name", () => {
    const headers = new Headers({ Authorization: "bearer test-cron-secret" });
    const request = new Request("http://localhost/api/cron/test", { headers });
    expect(request.headers.get("authorization")).toBe("bearer test-cron-secret");
    expect(assertCronSecret(request)).toBeNull();
  });

  it("returns 401 with a wrong secret", () => {
    const request = requestWith({ authorization: "Bearer wrong-secret" });
    const response = assertCronSecret(request);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
  });

  it("returns 401 with a missing Authorization header", () => {
    const response = assertCronSecret(requestWith({}));
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is unset, even if a bearer value is sent", () => {
    vi.stubEnv("CRON_SECRET", "");
    const request = requestWith({ authorization: "Bearer test-cron-secret" });
    const response = assertCronSecret(request);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
  });

  it("passes with the legacy CRON_API_KEY as raw Authorization header", () => {
    vi.stubEnv("CRON_API_KEY", "legacy-key");
    const request = requestWith({ authorization: "legacy-key" });
    expect(assertCronSecret(request)).toBeNull();
  });

  it("passes with the legacy CRON_API_KEY as ?apiKey= query parameter", () => {
    vi.stubEnv("CRON_API_KEY", "legacy-key");
    const request = requestWith({}, "http://localhost/api/cron/test?apiKey=legacy-key");
    expect(assertCronSecret(request)).toBeNull();
  });

  it("returns 401 when CRON_API_KEY is empty and an empty apiKey query param is sent (bypass guard)", () => {
    vi.stubEnv("CRON_API_KEY", "");
    const request = requestWith({}, "http://localhost/api/cron/test?apiKey=");
    const response = assertCronSecret(request);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
  });
});
