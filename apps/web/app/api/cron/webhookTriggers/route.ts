import { handleWebhookScheduledTriggers } from "@calcom/features/webhooks/lib/handleWebhookScheduledTriggers";
import prisma from "@calcom/prisma";
import { assertCronSecret } from "@lib/cronAuth";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function postHandler(req: NextRequest) {
  const unauthorized = assertCronSecret(req);
  if (unauthorized) {
    return unauthorized;
  }

  await handleWebhookScheduledTriggers(prisma);

  return NextResponse.json({ ok: true });
}

export const POST = defaultResponderForAppDir(postHandler);
