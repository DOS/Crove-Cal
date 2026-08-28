# Crove Cal — Architecture & Ecosystem Integration Guide

**Phiên bản:** 2.0.0  
**Cập nhật lần cuối:** 2026-08-26  
**Chủ quản:** Crove OS & DOS.Me Ecosystem

---

## I. Tổng quan Kiến trúc (Architectural Overview)

**Crove Cal** là nền tảng đặt lịch hẹn & quản lý lịch thông minh thế hệ mới (fork từ Cal.com / Cal.diy `v6.2.0`), được tối ưu hóa và tích hợp sâu vào hệ điều hành doanh nghiệp **Crove OS** và hệ thống định danh tập trung **DOS ID** (`id.dos.me` / `api.dos.me`).

Căn cứ theo quy chuẩn kiến trúc toàn hệ sinh thái, Crove Cal tuân thủ mô hình **Kiến trúc Lai 2 Tầng (2-Tier Hybrid Architecture)** kết hợp giữa đồng bộ dữ liệu cốt lõi (Database / Webhook Sync) và giao thức điều khiển nghiệp vụ sâu qua AI Agent (**Model Context Protocol - MCP**).

---

## II. Chuẩn Kiến trúc Đồng bộ 2 Tầng (2-Tier Hybrid Architecture)

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

    subgraph OutboundEcosystem [Crove Suite & Satellites]
        EventRouter[DOS.Me Webhook Dispatcher]
        CroveCRM[Crove CRM - crm.crove.com]
        CroveSign[Crove Sign - sign.crove.com]
        CrovePost[Crove Post - post.crove.com]
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
    EventRouter -->|Event: org.member_added / updated / deleted| WebhookEndpoint
    WebhookEndpoint -->|Verify HMAC & Sync| CalTeam
    WebhookEndpoint -->|Update Membership| CalMembership

    %% MCP Agentic Flow
    Agent -->|Call Tool: crove_cal_get_available_slots| MCPServer
    Agent -->|Call Tool: crove_cal_create_booking| MCPServer
    MCPServer -->|Query Schedule & Availability| CalEventTypes
    MCPServer -->|Insert Booking Record| CalBookings
```

### 1. Tầng 1: Đồng bộ Dữ liệu Danh tính & Tổ chức (Identity & Organization Sync)

Tầng 1 đảm bảo dữ liệu danh tính người dùng và cấu trúc tổ chức luôn nhất quán trên toàn hệ sinh thái mà không phụ thuộc vào độ trễ mạng:

1. **Single Source of Truth (SSOT)**:
   - Hệ thống trung tâm `api.dos.me` và bảng `public.organizations`, `public.org_members` trên Supabase là nơi lưu trữ gốc duy nhất cho danh tính và tổ chức.
2. **Cách ly Dữ liệu (Schema Isolation)**:
   - Cơ sở dữ liệu của Crove Cal hoạt động độc lập trên schema `cal` với role chuyên dụng `cal_app`, bảo vệ an toàn toàn vẹn dữ liệu.
3. **Đồng bộ Tức thời khi Đăng nhập (Inbound JIT Sync)**:
   - Khi người dùng đăng nhập qua DOS ID (OIDC / OAuth 2.1), hàm `syncDosOrganizations` đọc mảng claims `organizations` trong JWT token / UserInfo:
     ```json
     {
       "sub": "48fc3631-ec8c-4e78-aa98-ec89c1c3624d",
       "email": "joy@dos.ai",
       "name": "JOY",
       "active_org_id": "acbb5565-bdbb-43f9-a658-2bc8a326c85f",
       "organizations": [
         {
           "id": "acbb5565-bdbb-43f9-a658-2bc8a326c85f",
           "name": "JOY",
           "slug": "joy",
           "role": "OWNER"
         }
       ]
     }
     ```
   - Tự động tạo / cập nhật `cal.Team` (với `isOrganization = true` và `metadata.dosOrgId`), bản ghi `cal.Membership`, và `cal.Profile`.
4. **Đồng bộ Thời gian thực qua Webhook (Event-Driven Webhook Sync)**:
   - Endpoint: `/api/webhooks/dos-org-sync` tiếp nhận các sự kiện được ký HMAC-SHA256:
     - `organization.created` / `org.created`
     - `organization.updated` / `org.updated`
     - `organization.deleted` / `org.deleted`
     - `organization.member_added` / `org.member_added`
     - `organization.member_removed` / `org.member_removed`
     - `user.updated`
5. **Tạo Tổ chức Chiều đi (Outbound Creation Protocol)**:
   - Khi tạo tổ chức mới từ giao diện Crove Cal, backend gọi trực tiếp `POST https://api.dos.me/organizations` kèm `Authorization: Bearer <user_token>`. Không tự sinh UUID local ngẫu nhiên.

---

### 2. Tầng 2: Deep Agentic Business Actions (Giao thức MCP cho AI Agent)

Khi AI Agent (như Crove Desk AI, DOSClaw, DOS AI) cần thực hiện các tác vụ nghiệp vụ có side-effect hoặc tra cứu phức tạp, hệ thống sử dụng **Model Context Protocol (MCP)**:

| MCP Tool Name | Mục đích |
|---|---|
| `crove_cal_list_event_types` | Danh sách các loại lịch hẹn khả dụng của người dùng hoặc tổ chức |
| `crove_cal_get_event_type` | Xem chi tiết cấu hình và câu hỏi đặt lịch của một event type |
| `crove_cal_get_available_slots` | Tra cứu các khung giờ rảnh khả dụng của người dùng hoặc nhóm |
| `crove_cal_create_booking` | Tự động đặt lịch hẹn mới từ hội thoại hoặc ticket hỗ trợ |
| `crove_cal_get_booking` | Lấy chi tiết lịch hẹn theo UID hoặc Booking ID |
| `crove_cal_reschedule_booking` | Đổi lịch hẹn sang thời gian mới theo yêu cầu khách hàng |
| `crove_cal_cancel_booking` | Hủy lịch hẹn và giải phóng slot |
| `crove_cal_list_bookings` | Tra cứu danh sách các lịch hẹn theo email người tham gia / trạng thái |

Package mã nguồn MCP Server: `packages/mcp-server`
Khởi chạy stdio: `yarn mcp:server`

---

## III. Xác thực Tập trung (OIDC / OAuth 2.1 via DOS ID)

Crove Cal kết nối trực tiếp với OIDC Server chuẩn của DOS ID:

- **Issuer URL**: `https://gulptwduchsjcsbndmua.supabase.co/auth/v1`
- **Discovery Endpoint**: `https://gulptwduchsjcsbndmua.supabase.co/auth/v1/.well-known/openid-configuration`
- **Authorization Endpoint**: `https://gulptwduchsjcsbndmua.supabase.co/auth/v1/oauth/authorize`
- **Token Endpoint**: `https://gulptwduchsjcsbndmua.supabase.co/auth/v1/oauth/token`
- **UserInfo Endpoint**: `https://gulptwduchsjcsbndmua.supabase.co/auth/v1/oauth/userinfo`
- **Client ID**: `18790ccb-4d71-48cd-ad24-aee5f3ced3da`
- **Client Secret**: Quản lý an toàn qua GCP Secret Manager (`CROVE_OAUTH_CLIENT_SECRET`)
- **PKCE**: Bắt buộc (`checks: ["pkce", "state"]`)
- **JWT Signature Algorithm**: `ES256`

---

## IV. Cấu hình Email Giao dịch (Amazon SES & Brevo via SMTP)

Crove Cal sử dụng cấu hình SMTP tiêu chuẩn của Node.js (`nodemailer`), hỗ trợ trực tiếp mọi nhà cung cấp gửi email giao dịch (Amazon SES, Brevo) mà không cần phụ thuộc vào API độc quyền của SendGrid hay Resend:

### 1. Cấu hình Amazon SES (Simple Email Service)
```env
EMAIL_FROM="notifications@crove.com"
EMAIL_FROM_NAME="Crove Cal"
EMAIL_SERVER_HOST="email-smtp.ap-southeast-1.amazonaws.com" # Thay bằng region AWS SES của bạn
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER="<SES_SMTP_USERNAME>"
EMAIL_SERVER_PASSWORD="<SES_SMTP_PASSWORD>"
```

### 2. Cấu hình Brevo (Sendinblue)
```env
EMAIL_FROM="notifications@crove.com"
EMAIL_FROM_NAME="Crove Cal"
EMAIL_SERVER_HOST="smtp-relay.brevo.com"
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER="<BREVO_ACCOUNT_EMAIL>"
EMAIL_SERVER_PASSWORD="<BREVO_SMTP_KEY>"
```

---

## V. Quy chuẩn Nhận diện Thương hiệu & Fork Maintenance

Để đảm bảo khả năng merge và đồng bộ mượt mà với phiên bản gốc (`upstream/main` của Cal.com):

1. **Configuration Over Code**:
   - Tất cả thông tin nhận diện được cấu hình qua biến môi trường:
     - `NEXT_PUBLIC_APP_NAME="Crove"`
     - `NEXT_PUBLIC_COMPANY_NAME="MetaDOS LLC"`
     - `NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS="help@crove.com"`
2. **Kịch bản Patch Branding Tự động**:
   - Chạy lệnh `yarn patch:branding` (`scripts/patch-crove-branding.ts`) để tự động cập nhật localization catalogs khi sync code mới từ upstream.
3. **Root URL Optimization**:
   - Trực tiếp bake URL sản xuất `https://cal.crove.com` vào Dockerfile để loại bỏ quét sed khi khởi động container, đảm bảo thời gian khởi động tức thì (<2 giây).
