import { createHmac } from "node:crypto";

import { timingSafeStringsEqual } from "./webhook-signature";

// Why: a hardcoded fallback secret ("default-secret-change-me") combined with
// .env.example shipping CAL_VIDEO_RECORDING_TOKEN_SECRET empty let anyone forge
// recording download tokens offline (recording IDs appear in booking emails).
// Fail closed like NEXTAUTH_SECRET does in apps/web/next.config.ts instead of
// silently running on a publicly known key.
function getRecordingTokenSecret(): string {
  const secret = process.env.CAL_VIDEO_RECORDING_TOKEN_SECRET;
  if (!secret) {
    throw new Error("CAL_VIDEO_RECORDING_TOKEN_SECRET must be set to issue or verify video recording tokens");
  }
  return secret;
}

// 262992 minutes is 6 months
export function generateVideoToken(recordingId: string, expiresInMinutes = 262992) {
  const secret = getRecordingTokenSecret();
  const expires = Date.now() + expiresInMinutes * 60 * 1000;

  const payload = `${recordingId}:${expires}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");

  return `${payload}:${hmac}`;
}

export function verifyVideoToken(token: string): {
  valid: boolean;
  recordingId?: string;
} {
  try {
    const [recordingId, expires, receivedHmac] = token.split(":");
    const secret = getRecordingTokenSecret();

    if (Date.now() > parseInt(expires, 10)) {
      return { valid: false };
    }

    // Verify HMAC
    const payload = `${recordingId}:${expires}`;
    const expectedHmac = createHmac("sha256", secret).update(payload).digest("hex");

    // Why: `!==` on the hex digest short-circuits on the first differing byte,
    // leaking timing information; compare in constant time instead.
    if (typeof receivedHmac !== "string" || !timingSafeStringsEqual(receivedHmac, expectedHmac)) {
      return { valid: false };
    }

    return { valid: true, recordingId };
  } catch {
    return { valid: false };
  }
}
