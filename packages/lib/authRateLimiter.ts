import { createHash } from "node:crypto";

import logger from "./logger";

const log = logger.getSubLogger({ prefix: ["authRateLimiter"] });

export interface AuthRateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when the current window ends and attempts reset */
  resetAt: number;
}

export interface AuthRateLimiter {
  limit: (key: string) => AuthRateLimitResult;
  reset: () => void;
}

export interface AuthRateLimiterOptions {
  windowInMs?: number;
  maxRequests?: number;
  /** Injectable clock for tests */
  now?: () => number;
  /** Injectable bucket store for tests */
  store?: Map<string, { count: number; resetAt: number }>;
}

export const AUTH_RATE_LIMIT_DEFAULTS = {
  // 15 min is long enough to make online brute force impractical for weak secrets
  windowInMs: 15 * 60 * 1000,
  maxRequests: 5,
} as const;

// Buckets are bounded so a flood of unique identities cannot grow memory unboundedly
const MAX_BUCKETS = 100_000;

export function createAuthRateLimiter(options: AuthRateLimiterOptions = {}): AuthRateLimiter {
  const { windowInMs, maxRequests, now, store } = {
    ...AUTH_RATE_LIMIT_DEFAULTS,
    now: Date.now,
    store: new Map<string, { count: number; resetAt: number }>(),
    ...options,
  };

  return {
    limit(key: string): AuthRateLimitResult {
      try {
        return limitInStore({ key, store, windowInMs, maxRequests, now });
      } catch (error) {
        // Brute-force protection must fail closed: a broken limiter silently
        // allowing unlimited attempts is worse than briefly blocking requests
        log.error("Auth rate limiter errored; failing closed", error);
        return { allowed: false, remaining: 0, resetAt: now() + windowInMs };
      }
    },
    reset(): void {
      store.clear();
    },
  };
}

function limitInStore({
  key,
  store,
  windowInMs,
  maxRequests,
  now,
}: {
  key: string;
  store: Map<string, { count: number; resetAt: number }>;
  windowInMs: number;
  maxRequests: number;
  now: () => number;
}): AuthRateLimitResult {
  const nowMs = now();
  const windowStart = Math.floor(nowMs / windowInMs) * windowInMs;
  const resetAt = windowStart + windowInMs;
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= nowMs) {
    store.set(key, { count: 1, resetAt });
    if (store.size > MAX_BUCKETS) {
      sweepExpiredBuckets(store, nowMs);
    }
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetAt: bucket.resetAt,
  };
}

function sweepExpiredBuckets(store: Map<string, { count: number; resetAt: number }>, nowMs: number): void {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= nowMs) {
      store.delete(key);
    }
  }
}

const defaultLimiter = createAuthRateLimiter();

/**
 * Why: the Unkey-based `rateLimiter()` in rateLimit.ts no-ops without
 * UNKEY_ROOT_KEY, so sensitive auth endpoints (password, 2FA, email-verify)
 * would be unlimited in default deployments. This limiter always runs; limits
 * are per app-server instance, which is accurate enough for per-identity
 * brute-force protection and needs no external dependency.
 */
export function limitAuthRate(key: string, limiter: AuthRateLimiter = defaultLimiter): AuthRateLimitResult {
  return limiter.limit(key);
}

/** Truncated SHA-256 keeps raw emails/usernames out of limiter memory */
export function hashRateLimitIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex").slice(0, 32);
}
