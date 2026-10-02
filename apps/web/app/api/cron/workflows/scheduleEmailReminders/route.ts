import { WorkflowMethods } from "@calcom/prisma/enums";
import { dispatchDueReminders } from "@calcom/features/workflows/lib/reminderDispatcher";
import { assertCronSecret } from "@lib/cronAuth";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function postHandler(request: NextRequest) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await dispatchDueReminders({ method: WorkflowMethods.EMAIL });
  return NextResponse.json(result);
}

export const POST = defaultResponderForAppDir(postHandler);
