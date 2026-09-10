import type { AuthRateLimiter } from "@calcom/lib/authRateLimiter";
import { createAuthRateLimiter } from "@calcom/lib/authRateLimiter";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { enforceAuthRateLimit } from "../../../middlewares/authRateLimitMiddleware";

const WINDOW_IN_MS = 60_000;
const MAX_REQUESTS = 3;

function buildTestLimiter(nowMs: number): { limiter: AuthRateLimiter; tick: (ms: number) => void } {
  let now = nowMs;
  const limiter = createAuthRateLimiter({
    windowInMs: WINDOW_IN_MS,
    maxRequests: MAX_REQUESTS,
    now: () => now,
  });
  return {
    limiter,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

function buildMiddlewareInvocation({
  sourceIp,
  input,
  limiter,
}: {
  sourceIp: string;
  input: unknown;
  limiter?: AuthRateLimiter;
}) {
  const next: Mock = vi.fn().mockResolvedValue({ ctx: {} });
  return {
    next,
    invoke: async () => {
      await enforceAuthRateLimit("verifyPassword", { sourceIp }, input, limiter);
      return next();
    },
  };
}

describe("authRateLimitMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests under the limit", async () => {
    const { limiter } = buildTestLimiter(Date.now());
    const { invoke } = buildMiddlewareInvocation({ sourceIp: "203.0.113.10", input: { email: "user@example.com" }, limiter });

    await expect(invoke()).resolves.not.toThrow();
    await expect(invoke()).resolves.not.toThrow();
    await expect(invoke()).resolves.not.toThrow();
  });

  it("blocks requests over the limit with a 429 TOO_MANY_REQUESTS error", async () => {
    const { limiter } = buildTestLimiter(Date.now());
    const { invoke, next } = buildMiddlewareInvocation({ sourceIp: "203.0.113.10", input: { email: "user@example.com" }, limiter });

    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      await invoke();
    }

    await expect(invoke()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    await expect(invoke()).rejects.toBeInstanceOf(TRPCError);
    expect(next).toHaveBeenCalledTimes(MAX_REQUESTS);
  });

  it("isolates buckets between different IPs", async () => {
    const { limiter } = buildTestLimiter(Date.now());
    const blocked = buildMiddlewareInvocation({ sourceIp: "203.0.113.10", input: { email: "user@example.com" }, limiter });
    const otherIp = buildMiddlewareInvocation({ sourceIp: "198.51.100.77", input: { email: "user@example.com" }, limiter });

    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      await blocked.invoke();
    }
    await expect(blocked.invoke()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    await expect(otherIp.invoke()).resolves.not.toThrow();
  });

  it("isolates buckets between different identities on the same IP", async () => {
    const { limiter } = buildTestLimiter(Date.now());
    const firstUser = buildMiddlewareInvocation({ sourceIp: "203.0.113.10", input: { email: "user1@example.com" }, limiter });
    const secondUser = buildMiddlewareInvocation({ sourceIp: "203.0.113.10", input: { email: "user2@example.com" }, limiter });

    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      await firstUser.invoke();
    }
    await expect(firstUser.invoke()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    await expect(secondUser.invoke()).resolves.not.toThrow();
  });

  it("allows requests again after the window expires", async () => {
    const fixedStart = 1_700_000_000_000;
    const { limiter, tick } = buildTestLimiter(fixedStart);
    const { invoke } = buildMiddlewareInvocation({ sourceIp: "203.0.113.10", input: { email: "user@example.com" }, limiter });

    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      await invoke();
    }
    await expect(invoke()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    // Crossing the window boundary resets the bucket count
    tick(WINDOW_IN_MS + 1);
    await expect(invoke()).resolves.not.toThrow();
  });

  it("keys unauthenticated requests by IP when no identity is available", async () => {
    const { limiter } = buildTestLimiter(Date.now());
    const anonymous = buildMiddlewareInvocation({ sourceIp: "203.0.113.10", input: undefined, limiter });

    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      await anonymous.invoke();
    }
    await expect(anonymous.invoke()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
