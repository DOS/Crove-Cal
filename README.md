# Crove Cal — The Enterprise AI-Native Scheduling Platform

<p align="center">
  <img src="https://user-images.githubusercontent.com/8019099/210054112-5955e812-a76e-4160-9ddd-58f2c72f1cce.png" alt="Crove Cal Logo" width="120" />
  <h2 align="center">Crove Cal</h2>
  <p align="center">
    <strong>The Enterprise-Grade, Multi-Tenant, AI-Agent-Powered Scheduling Platform</strong>
    <br />
    <em>An advanced open evolution of Cal.diy with full native Organizations, Teams, MCP Agent Protocol & DOS ID SSO.</em>
  </p>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/DOS/Crove-Cal/actions"><img src="https://img.shields.io/badge/CI%2FCD-Passing-brightgreen.svg" alt="CI/CD Status"></a>
  <a href="https://cal.crove.com"><img src="https://img.shields.io/badge/Production-cal.crove.com-purple.svg" alt="Production"></a>
  <a href="./docs/Architecture.md"><img src="https://img.shields.io/badge/Architecture-2--Tier%20Hybrid-orange.svg" alt="Architecture"></a>
</p>

---

## 🌟 Why Crove Cal?

When Cal.com launched **Cal.diy**, it removed Enterprise Edition features (**Organizations, Teams, Round-Robin, Managed Event Types, SSO/SAML**) to keep community users on a single-user personal tier.

**Crove Cal** restores and dramatically expands upon these capabilities. Built as the scheduling backbone of the **Crove OS** and **DOS Ecosystem**, Crove Cal is an **all-in-one, multi-tenant scheduling operating system** designed for modern teams, enterprises, and autonomous AI Agents.

---

## 🚀 Feature Comparison: Crove Cal vs. Cal.diy vs. Cal.com

| Feature Area | Cal.diy (Upstream) | Cal.com (Commercial) | ⚡ Crove Cal (This Fork) |
| :--- | :---: | :---: | :---: |
| **Open Source & License** | MIT (Stripped) | AGPL / Proprietary EE | **100% MIT (Full Enterprise)** |
| **Multi-Tenant Organizations** | ❌ Stripped | ✅ Paid EE License | **✅ Native Multi-Tenant Built-in** |
| **Team Scheduling (Round-Robin / Collective)** | ❌ Stripped | ✅ Paid EE License | **✅ Native Team Scheduling** |
| **Managed Event Types** | ❌ Stripped | ✅ Paid EE License | **✅ Full Managed & Parent-Child Events** |
| **Central SSO & OIDC (OAuth 2.1)** | ❌ Stripped | 💵 Enterprise Addon | **✅ Native DOS ID OIDC (PKCE / ES256)** |
| **AI Agent Protocol (MCP Server)** | ❌ Not available | ❌ Not available | **✅ Native Model Context Protocol (13 Tools)** |
| **Two-Way Ecosystem Hybrid Sync** | ❌ Not available | ❌ Not available | **✅ JIT Login + Realtime HMAC Webhooks** |
| **Multi-Product App Switcher** | ❌ Not available | ❌ Not available | **✅ Integrated Crove Suite App Switcher** |
| **Transactional Email Engine** | SendGrid / Resend only | Proprietary | **✅ Standard SMTP (Amazon SES + Brevo)** |
| **Brevo CRM Realtime Sync Bridge** | ❌ Not available | ❌ Not available | **✅ Auto-Sync Contacts & Meeting Events** |
| **Zero Telemetry / Full Self-Hostable** | Partial | ❌ Cloud Lock-in | **✅ 100% Isolated & Self-Hostable** |

---

## 🏛️ System Architecture

Crove Cal operates on the **Crove OS 2-Tier Hybrid Architecture Standard**:

```mermaid
flowchart TB
    subgraph ClientLayer [Client & Agent Interaction Layer]
        User[End User / Browser]
        Agent[DOS AI / Crove Desk Agent]
    end

    subgraph DOS_Identity [Identity & Auth Provider - id.dos.me]
        SupabaseAuth[Supabase OIDC Server\nRS256 / ES256 PKCE]
        CustomHook[Custom Access Token Hook\nInjects 'organizations' & 'role']
    end

    subgraph CroveCalApp [Crove Cal Service - cal.crove.com]
        NextAuth[NextAuth OIDC Provider\nDosIdProvider]
        JIT[JIT Sync Logic\nsyncDosOrganizations]
        WebhookEndpoint[/api/webhooks/dos-org-sync\nHMAC-SHA256 Signed]
        CalCore[Next.js App Router & tRPC API]
        MCPServer[Crove Cal MCP Server\n@calcom/mcp-server]
    end

    subgraph DatabaseLayer [Shared Supabase PostgreSQL Instance]
        subgraph PublicSchema [public schema - SSOT]
            DOSOrgs[(public.organizations)]
            DOSMembers[(public.org_members)]
            AuthUsers[(auth.users)]
        end
        subgraph CalSchema [cal schema - Isolated]
            CalUsers[(cal.users)]
            CalTeam[(cal.Team - isOrg)]
            CalMembership[(cal.Membership)]
            CalProfile[(cal.Profile)]
            CalBookings[(cal.Booking)]
            CalEventTypes[(cal.EventType)]
        end
    end

    %% Auth & JIT Flow
    User -->|1. Sign in with DOS.Me ID| NextAuth
    NextAuth -->|2. Authorize & PKCE Token Exchange| SupabaseAuth
    SupabaseAuth -->|3. Trigger Hook & Issue Claims| CustomHook
    CustomHook -->|4. Return JWT with orgs| NextAuth
    NextAuth -->|5. On SignIn Callback| JIT
    JIT -->|6. Upsert Isolated Team & Profile| CalTeam
    JIT -->|6. Upsert Membership| CalMembership
    JIT -->|6. Upsert User| CalUsers

    %% Real-time Webhook Flow
    WebhookEndpoint -->|Verify HMAC & Sync| CalTeam
    WebhookEndpoint -->|Update Membership| CalMembership

    %% MCP Agentic Flow
    Agent -->|Call Tool: crove_cal_get_available_slots| MCPServer
    Agent -->|Call Tool: crove_cal_create_booking| MCPServer
    MCPServer -->|Query Schedule & Availability| CalEventTypes
    MCPServer -->|Insert Booking Record| CalBookings
```

For full architectural blueprints, see [docs/Architecture.md](./docs/Architecture.md).

---

## 🤖 Model Context Protocol (MCP) Server

Crove Cal includes a dedicated `@calcom/mcp-server` package exposing **13 high-level tools** for AI Agents (Claude Desktop, Cursor, DOS AI, Crove Desk):

| MCP Tool Name | Description |
| :--- | :--- |
| `crove_cal_list_event_types` | List available meeting and booking event types for a user or organization. |
| `crove_cal_get_event_type` | Get detailed configuration and question fields for a specific event type. |
| `crove_cal_create_event_type` | Create a new event type (title, duration, description, confirmation rules). |
| `crove_cal_update_event_type` | Update title, length, description, or visibility of an existing event type. |
| `crove_cal_delete_event_type` | Remove an event type by ID. |
| `crove_cal_get_available_slots` | Calculate bookable time slots between two dates accounting for busy intervals. |
| `crove_cal_create_booking` | Schedule a meeting with attendee details, notes, and calendar invites. |
| `crove_cal_get_booking` | Retrieve booking details by UID or Booking ID. |
| `crove_cal_reschedule_booking` | Reschedule a booking to a new start time. |
| `crove_cal_cancel_booking` | Cancel an existing booking and free up the slot. |
| `crove_cal_list_bookings` | List recent bookings filtered by host/attendee email and status. |
| `crove_cal_get_user_profile` | Retrieve user profile, timezone, default schedule, and team memberships. |
| `crove_cal_list_schedules` | List working hours schedules and daily availability intervals. |

### Run MCP Server
```bash
yarn mcp:server
```

---

## 📧 Email Integration (Amazon SES & Brevo)

Crove Cal uses standard Node.js SMTP transport, eliminating proprietary vendor lock-in.

### Amazon SES Configuration (`.env`)
```env
EMAIL_FROM="cal@crove.com"
EMAIL_FROM_NAME="Crove Cal"
EMAIL_SERVER_HOST="email-smtp.ap-southeast-1.amazonaws.com"
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER="<YOUR_SES_SMTP_USERNAME>"
EMAIL_SERVER_PASSWORD="<YOUR_SES_SMTP_PASSWORD>"
```

### Brevo CRM Contact & Event Sync Bridge
Point your Crove Cal webhook to `/api/webhooks/brevo` to automatically sync booking attendees into Brevo CRM contacts and track marketing automation events.

---

## 🛠️ Quick Start & Local Development

### Prerequisites
- Node.js `>=20.x`
- PostgreSQL `>=14.x` (or Supabase)
- Yarn `4.x` (Berry)

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/DOS/Crove-Cal.git
cd Crove-Cal

# 2. Install dependencies
yarn install

# 3. Configure environment
cp .env.example .env

# 4. Deploy database migrations
yarn workspace @calcom/prisma db-deploy

# 5. Run development server
yarn dev
```

---

## 🚢 Docker Production Deployment

```bash
docker compose pull crove-cal
docker compose up -d --force-recreate crove-cal
```

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.
All Enterprise features are delivered under pure open-source MIT terms with zero proprietary restrictions.
