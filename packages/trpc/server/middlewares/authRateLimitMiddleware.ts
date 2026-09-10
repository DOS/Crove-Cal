import {
  hashRateLimitIdentifier,
  limitAuthRate,
  type AuthRateLimiter,
  type AuthRateLimitResult,
} from "@calcom/lib/authRateLimiter";
import { TRPCError } from "@trpc/server";

type AuthIdentityRecord = Partial<Record<(typeof AUTH_IDENTITY_KEYS)[number], unknown>>;

const AUTH_IDENTITY_KEYS = ["email", "username"] as const;

/**
 * Why: sensitive auth endpoints are brute-force targets and the shared
 * `rateLimiter()` no-ops without UNKEY_ROOT_KEY. Buckets are keyed by
 * route + IP + hashed identity so one identity cannot exhaust another's
 * budget, and unauthenticated requests still get a per-IP budget.
 */
/**
 * Why: called from an inline `.use(async (opts) => ...)` callback on each
 * procedure so tRPC infers the context and preserves the procedure's output
 * type; a standalone `middleware()` factory cannot unify its builder with
 * authedProcedure's invariant generics.
 */
export async function enforceAuthRateLimit(
  route: string,
  ctx: { sourceIp?: string; user?: unknown },
  input: unknown,
  limiter?: AuthRateLimiter,
): Promise<void> {
  const result = limitAuthRate(authRateLimitKey(route, ctx, input), limiter);
  if (!result.allowed) {
    throw tooManyRequestsError(result);
  }
}

export function authRateLimitKey(route: string, ctx: { sourceIp?: string; user?: unknown }, input: unknown): string {
  const identity = extractAuthIdentity(ctx, input);
  // Unknown identities share a per-IP budget instead of bypassing the limit
  return `${route}:${ctx.sourceIp ?? "unknown"}:${identity ? hashRateLimitIdentifier(identity) : "anonymous"}`;
}

function extractAuthIdentity(ctx: { user?: unknown }, input: unknown): string | null {
  const fromInput = findFirstIdentityField(input);
  if (fromInput) {
    return fromInput;
  }
  const fromSession = findFirstIdentityField(ctx.user);
  if (fromSession) {
    return fromSession;
  }
  return null;
}

function findFirstIdentityField(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as AuthIdentityRecord;
  for (const key of AUTH_IDENTITY_KEYS) {
    const identity = record[key];
    if (typeof identity === "string" && identity.trim().length > 0) {
      return identity.trim().toLowerCase();
    }
  }
  return null;
}

function tooManyRequestsError(result: AuthRateLimitResult): TRPCError {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
  });
}
