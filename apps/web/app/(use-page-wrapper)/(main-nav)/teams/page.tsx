import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import type { PageProps } from "app/_types";
import { _generateMetadata, getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { TeamsListingView } from "~/teams/views/teams-listing-view";
import { ShellMainAppDir } from "../ShellMainAppDir";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => t("teams"),
    (_t) => "Manage your organizations and teams",
    undefined,
    undefined,
    "/teams"
  );
};

const Page = async (_props: PageProps) => {
  const t = await getTranslate();
  const _headers = await headers();
  const _cookies = await cookies();
  const session = await getServerSession({ req: buildLegacyRequest(_headers, _cookies) });

  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  return (
    <ShellMainAppDir
      heading={t("teams")}
      subtitle="Manage your organizations, departments, and booking teams">
      <TeamsListingView />
    </ShellMainAppDir>
  );
};

export default Page;
