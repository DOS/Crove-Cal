import { createHash } from "node:crypto";

import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { hashEmail } from "@calcom/lib/server/PiiHasher";
import { totpRawCheck } from "@calcom/lib/totp";

export const verifyCodeUnAuthenticated = async (email: string, code: string) => {
  if (!email || !code) {
    throw new Error("Email and code are required");
  }

  await checkRateLimitAndThrowError({
    rateLimitingType: "core",
    identifier: `emailVerifyCode.${hashEmail(email)}`,
  });

  // A missing key would degrade the seed to a pure function of the victim
  // email (audit LO-05); fail loudly instead (same pattern as next.config.ts).
  if (!process.env.CALENDSO_ENCRYPTION_KEY) throw new Error("Please set CALENDSO_ENCRYPTION_KEY");
  const secret = createHash("md5")
    .update(email + process.env.CALENDSO_ENCRYPTION_KEY)
    .digest("hex");

  const isValidToken = totpRawCheck(code, secret, { step: 900 });

  if (!isValidToken) {
    throw new Error("Invalid verification code");
  }

  return true;
};
