import { createHmac, timingSafeEqual } from "node:crypto";

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
