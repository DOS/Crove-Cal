# Changelog — Crove Cal

All notable changes to the **Crove Cal** platform will be documented in this file.

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
