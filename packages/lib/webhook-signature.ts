import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SHA256_HEX_64_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an HMAC-SHA256 webhook signature over the raw request body.
 * Expected header format: `sha256=<hex>` (64 hex characters).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const providedSignature = signatureHeader.slice("sha256=".length);
  if (!SHA256_HEX_64_PATTERN.test(providedSignature)) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  // timingSafeEqual throws when buffer lengths differ, so validate the hex length above before comparing
  return timingSafeEqual(Buffer.from(providedSignature, "hex"), Buffer.from(expectedSignature, "hex"));
}

/**
 * Constant-time comparison of two arbitrary strings (secrets or HMAC digests).
 * Both sides are hashed with SHA-256 first so the buffers always have equal length,
 * which timingSafeEqual requires.
 *
 * Why: `===` short-circuits at the first differing byte, leaking timing information
 * that helps an attacker forge signatures or secrets byte by byte.
 */
export function timingSafeStringsEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}
