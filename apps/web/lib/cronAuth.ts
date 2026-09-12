import { createHash, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { NextResponse } from "next/server";

/**
 * Timing-safe string comparison.
 *
 * Both sides are hashed with SHA-256 before `timingSafeEqual` so the compared
 * buffers always have the same length: `timingSafeEqual` throws on length
 * mismatch, and an exception thrown/not-thrown would itself leak the secret
 * length. Hashing first gives fixed-length digests and removes that leak.
 */
function secretsMatch(provided: string, expected: string | undefined): boolean {
  if (!expected) {
    // Fail closed when the secret is unset or empty (an empty expected value
    // would otherwise match an empty provided value and bypass auth entirely).
    return false;
  }
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Shared authentication for /api/cron/* routes.
 *
 * Accepts:
 * - `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends, see vercel.json crons)
 * - legacy `CRON_API_KEY` either as the raw `Authorization` header value or as
 *   the `?apiKey=` query parameter (external schedulers / cron-tester.ts)
 *
 * Returns `null` when the request is authorized, otherwise a 401 NextResponse
 * that the route should return immediately.
 */
export function assertCronSecret(request: Request): NextResponse | null {
  // Header names are case-insensitive per the fetch spec; the "Bearer" scheme
  // prefix is compared case-insensitively as well.
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerValue = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1] ?? "";
  const rawHeaderValue = authHeader.trim();
  const queryApiKey = new URL(request.url).searchParams.get("apiKey") ?? "";

  const authorized =
    secretsMatch(bearerValue, process.env.CRON_SECRET) ||
    secretsMatch(rawHeaderValue, process.env.CRON_API_KEY) ||
    secretsMatch(queryApiKey, process.env.CRON_API_KEY);

  if (authorized) {
    return null;
  }

  return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
}
