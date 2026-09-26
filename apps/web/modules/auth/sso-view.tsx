"use client";

import { signIn } from "next-auth/react";
import type { ParsedUrlQuery } from "node:querystring";
import { useEffect, useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";

import AuthContainer from "@components/ui/AuthContainer";

export type PageProps = {
  query: ParsedUrlQuery;
  breakGlassLoginEnabled: boolean;
};

/**
 * Bridge page of the DOS ID auto-SSO flow. The middleware sends /auth/login here
 * whenever the dos-id provider is configured, and this view immediately starts the
 * next-auth sign-in (which owns CSRF + state + the IdP redirect). The classic
 * login form stays reachable through /auth/login?direct=1 as the break-glass path,
 * but only when the deployment has a break-glass allowlist configured.
 */
export function SsoRedirect(props: PageProps) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);

  const callbackUrl = typeof props.query.callbackUrl === "string" ? props.query.callbackUrl : "/";

  useEffect(() => {
    let cancelled = false;
    signIn("dos-id", { callbackUrl, redirect: true }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [callbackUrl]);

  const fallbackHref = `/auth/login?direct=1&callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <AuthContainer showLogo>
      <div className="text-center">
        <h3 className="text-emphasis text-lg font-medium leading-6">
          {t(failed ? "sso_redirect_failed" : "sso_redirecting_title")}
        </h3>
        <div className="mt-2">
          <p className="text-subtle text-sm">{t("sso_redirecting_body")}</p>
        </div>
      </div>
      {props.breakGlassLoginEnabled && (
        <Button
          className="mt-6 flex w-full justify-center"
          loading={!failed}
          disabled={!failed}
          href={fallbackHref}>
          {t("sso_use_other_login")}
        </Button>
      )}
    </AuthContainer>
  );
}

export default SsoRedirect;
