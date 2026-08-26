# Changelog — Crove Cal

All notable changes to the **Crove Cal** platform will be documented in this file.

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
