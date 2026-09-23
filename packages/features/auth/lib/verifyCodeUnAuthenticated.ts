import { createHash } from "node:crypto";

import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { hashEmail } from "@calcom/lib/server/PiiHasher";
import { totpRawCheck } from "@calcom/lib/totp";

import { isBreakGlassLoginAllowed } from "./syncDosOrganizations";

export const verifyCodeUnAuthenticated = async (email: string, code: string) => {
  if (!email || !code) {
    throw new Error("Email and code are required");
  }

  // Email-code sign-in is part of the admin break-glass path: when ADMIN_EMAILS
  // is configured, non-allowlisted accounts must use the DOS ID provider.
  if (!isBreakGlassLoginAllowed(email)) {
    throw new Error("third-party-identity-provider-enabled");
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
