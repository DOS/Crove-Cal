# Changelog — Crove Cal

All notable changes to the **Crove Cal** platform will be documented in this file.

---

## [2.3.0] - 2026-09-08

### Security
- **Upstream Sync (cal.diy main, 7 fixes)**: HitPay/PayPal zero-decimal currency charging (VND/JPY/KRW were billed at 1% of price), `tempOrgRedirect` writes inside the `updateUser` transaction, CalVideoSettings API defaults, i18n (ja/pl), removal of unused `TokenHandler`.
- **Authentication**: removed hardcoded DOS.Me OIDC client id/secret fallbacks; `dos-id` provider registers only when OIDC credentials are configured; JWT `update` callback re-anchors identity to `token.sub` instead of client-supplied `session.email`; JIT provisioning no longer adopts organizations by slug and caps claim-derived roles at MEMBER.
- **Webhooks**: `brevo` and `crove-crm` routes require HMAC-SHA256 signatures (`timingSafeEqual`, fail-closed) with a 50-attendee cap; `dos-org-sync` requires a dedicated `DOS_SYNC_WEBHOOK_SECRET`, rejects stale timestamps and replayed delivery ids, and scopes `team.deleted` to the parent organization; `/api/webhooks/health` requires a session (POST requires ADMIN); `/api/health` no longer echoes raw database errors.
- **Authorization**: Teams/Organizations endpoints enforce accepted membership (member rosters with email addresses no longer leak to non-members); ADMIN can no longer evict the OWNER or self-grant OWNER; last-OWNER protection; `inviteMember` records a real verification token and answers with an opaque status; Workflows enforce team membership and scope mutations to the owner.
- **Database**: TLS certificate verification defaults to on (`DATABASE_SSL_REJECT_UNAUTHORIZED=false` opts out); fixed a pg pool leak in the api/v2 non-pool branch; added migration recreating the Workflow tables dropped by upstream `20260319000000_drop_workflow_tables` (fixes `P2021` and the `/workflows` 500).
- **Dependencies (Dependabot)**: bumped `next` 16.2.11, `next-auth` 4.24.15, `tar` 7.5.21, `websocket-driver` 0.7.5, `axios` 1.16.0, `hono` 4.12.25, `vite` 6.4.3, `protobufjs` 7.5.6, `@xmldom/xmldom`, `brace-expansion`; added `.github/dependabot.yml`.

### Fixed
- Cross-user cache leak on `/event-types/[type]` (`unstable_cache` keyed on headers/cookies objects that serialize to constants, so every user shared one entry and the router authorization never ran).
- `turbo.json` `post-install` ordering (`dependsOn: ["^post-install"]`) with upstream `permissions.ts` restored — fixes the intermittent TS2305 `PLATFORM_PERMISSION` failure during `yarn install`.
- `/teams` renders real strings instead of raw i18n keys (`create_a_team`, `no_teams_yet`, `team_created_successfully`, `create_team_description`).
- MCP server: removed the "first available user" ownership fallback and the empty-`OR` schedule lookup that returned another tenant's schedule; added a `type-check` script (fixed 6 latent Prisma typing errors).
- `crovecrm` declares its workspace dependencies; husky install failures are no longer silently swallowed; `return` added before `redirect()` in two pages; webhook monitor shared across processes with honest delivery reporting.

### Docs
- Added `docs/audit/2026-09-08-audit-report.html` — full-repo audit report (76 findings with IDs, priorities, fix status table).

---

## [2.2.0] - 2026-09-03

### Added
- **DOS.Me Organization -> Teams Hierarchy & Zero-Latency JIT Token Claims**:
  - Adopted new JWT token claims structure with `claims.organizations`, `claims.teams`, and `claims.active_org_id`.
  - Automatic sub-team hierarchy provisioning (`parentId` mapping from `dosTeamId` to parent `dosOrgId`).
  - Automatic role mapping from SSO (`LEAD` and `ADMIN` map to Cal.com `MembershipRole.ADMIN`).
  - Real-time webhook handlers for `team.created`, `team.updated`, `team.deleted`, `team.member_added`, `team.member_removed`.
- **Webhook Health & Realtime Monitoring**:
  - Implemented `@calcom/lib/webhookMonitor` service tracking latency, success rates, event volumes, and delivery audit logs in an in-memory telemetry buffer.
  - Added public `/api/webhooks/health` API endpoint supporting GET metrics and POST simulated test pings.
  - Added dedicated Webhook Health & Monitoring Dashboard UI at `/settings/developer/webhooks/monitoring` with live auto-refresh.
- **Crove CRM Direct Integration (`crm.crove.com`)**:
  - Added `@calcom/features/crove-crm` (`CroveCrmService`) for contact upsertion and booking activity timeline synchronization with Team/Org attribution.
  - Added `/api/webhooks/crove-crm` webhook bridge endpoint.
  - Registered native **Crove CRM** app card (`@calcom/crovecrm`) in the Cal.com App Store under the CRM category (`/apps/categories/crm`) with full `CrmServiceMap` integration.
- **Deep Database Health Check Endpoint**:
  - Implemented `/api/health` probe endpoint returning DB connectivity, latency in milliseconds, uptime, and application version for container orchestration and uptime monitors.

### Optimized & Fixed
- Removed unused `@ts-expect-error` in `useRouterQuery.ts` for clean ES2024 native `entries` iteration.
- Guarded `husky install` in Docker build stages when `.git` is absent.
- Guarded `required` jobs in `.github/workflows/pr.yml` and `all-checks.yml` (`if: github.repository == 'calcom/cal.diy'`), permanently eliminating failed notification emails on the repository fork.

---

## [2.1.0] - 2026-09-01

### Added
- **TypeScript 6.0.3 Monorepo Upgrade**:
  - Upgraded `typescript` to `6.0.3` across all 115 packages and applications in the Turborepo monorepo.
  - Modernized compiler targets to `ES2024` / `ES2022` in `packages/tsconfig/base.json`, `nextjs.json`, and package-level configurations.
  - Added `docs/TypeScript-7-Migration-Roadmap.md` with technical audit and migration plan for future TypeScript 7.x release.
- **Clean-Room Multi-Tenant Teams & Organizations**:
  - Implemented `TeamService` and `OrganizationService` in `packages/features/teams` and `packages/features/organizations`.
  - Added viewer tRPC routers `viewer.teams` and `viewer.organizations`.
  - Added `/teams` frontend listing view with department creation dialog.
- **Universal Crove App Switcher**:
  - Implemented `<CroveAppSwitcher />` component in `@calcom/ui` with comprehensive ecosystem directory (Crove Suite & DOS Ecosystem apps).
  - Integrated App Switcher into `TopNav.tsx` and `SideBar.tsx`.
- **Expanded E2E Playwright Test Suite**:
  - Added comprehensive E2E tests for DOS ID login, App Switcher, multi-tenant page protections, and webhook health checks.

---

## [2.0.0] - 2026-08-26

### Added
- **2-Tier Hybrid Architecture Adoption**: Implemented standard Crove OS 2-tier architecture combining Database/Webhook sync (Tier 1) and MCP protocol for AI agentic actions (Tier 2).
- **DOS.Me ID Centralized Authentication (OIDC / OAuth 2.1)**:
  - Native integration with Supabase OAuth 2.1 + PKCE server.
  - Configured `ES256` token signature algorithm for Supabase Auth JWT compatibility.
  - Implemented `allowDangerousEmailAccountLinking` and dynamic runtime provider evaluation.
- **Two-Way Organization Synchronization (Hybrid Sync)**:
  - Inbound JIT (Just-In-Time) organization & profile sync on OIDC login (`syncDosOrganizations`).
  - Real-time webhook listener at `/api/webhooks/dos-org-sync` with HMAC-SHA256 signature verification supporting `organization.*` and `org.*` event conventions.
- **Automated Branding Pipeline**:
  - Standardized environment variables: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS`.
  - Added automated localization patching script `yarn patch:branding` (`scripts/patch-crove-branding.ts`).
  - Added comprehensive architecture specification at `docs/Architecture.md`.

### Fixed
- Fixed NextAuth OIDC discovery and token exchange by properly registering `wellKnown` and PKCE checks.
- Fixed root route rewrite collision by scoping routing configurations.
- Guarded upstream-only CI workflows against failing on fork repository.

### Optimized
- Optimized Docker container startup by pre-baking production URL `https://cal.crove.com`, eliminating cold start string replacement overhead.
- Automated Docker image build and push to GHCR (`ghcr.io/dos/crove-cal:latest`).
