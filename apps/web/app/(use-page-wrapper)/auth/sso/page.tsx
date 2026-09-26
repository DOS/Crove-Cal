import type { PageProps } from "app/_types";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";

import { buildLegacyCtx } from "@lib/buildLegacyCtx";
import { isBreakGlassLoginConfigured } from "@calcom/features/auth/lib/syncDosOrganizations";

import SsoRedirect from "~/auth/sso-view";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => t("sso_redirecting_title"),
    (t) => t("sso_redirecting_body"),
    undefined,
    undefined,
    "/auth/sso"
  );
};

const Page = async ({ params, searchParams }: PageProps) => {
  const h = await headers();
  const context = buildLegacyCtx(h, await cookies(), await params, await searchParams);

  // Server-derived: the break-glass allowlist itself never reaches the client -
  // only the boolean telling the bridge whether the classic form is usable.
  return <SsoRedirect query={context.query} breakGlassLoginEnabled={isBreakGlassLoginConfigured()} />;
};

export default Page;
