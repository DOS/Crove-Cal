import { SignJWT } from "jose";

import { WEBSITE_URL } from "@calcom/lib/constants";

const signJwt = async (payload: { email: string }) => {
  // A missing key would encode to a zero-length secret, which jose happily
  // signs with - fail loudly instead (same pattern as next.config.ts).
  if (!process.env.CALENDSO_ENCRYPTION_KEY) throw new Error("Please set CALENDSO_ENCRYPTION_KEY");
  const secret = new TextEncoder().encode(process.env.CALENDSO_ENCRYPTION_KEY);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.email)
    .setIssuedAt()
    .setIssuer(WEBSITE_URL)
    .setAudience(`${WEBSITE_URL}/auth/login`)
    .setExpirationTime("2m")
    .sign(secret);
};

export default signJwt;
