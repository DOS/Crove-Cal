import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { APP_NAME } from "@calcom/lib/constants";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import { WorkflowsListingView } from "~/workflows/views/workflows-listing-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => "Workflows",
    (t) => `Automate meeting email/SMS reminders and follow-up notifications in ${APP_NAME}`,
    undefined,
    undefined,
    "/workflows"
  );

const WorkflowsPage = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  return <WorkflowsListingView />;
};

export default WorkflowsPage;
