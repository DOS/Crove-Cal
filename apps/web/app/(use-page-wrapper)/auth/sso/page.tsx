import type { PageProps } from "app/_types";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";

import { buildLegacyCtx } from "@lib/buildLegacyCtx";

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

  return <SsoRedirect query={context.query} />;
};

export default Page;
