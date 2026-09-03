import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { APP_NAME } from "@calcom/lib/constants";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import { WebhookMonitoringDashboard } from "~/webhooks/views/webhook-monitoring-dashboard";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => "Webhook Monitoring & Health",
    (t) => `Realtime delivery health and diagnostics for ${APP_NAME} webhooks`,
    undefined,
    undefined,
    "/settings/developer/webhooks/monitoring"
  );

const WebhookMonitoringPage = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  return <WebhookMonitoringDashboard />;
};

export default WebhookMonitoringPage;
