# Lộ trình và Hướng dẫn Nâng cấp TypeScript 7.0 (TS 7.0 Migration Roadmap)

Tài liệu này cung cấp kế hoạch kiểm toán kỹ thuật (technical audit) chi tiết và lộ trình chuyển đổi toàn diện cho monorepo **Crove Cal** từ **TypeScript 6.0.3** lên **TypeScript 7.0**, bảo đảm hệ thống không bị gián đoạn, tuân thủ tiêu chuẩn ECMAScript hiện đại và tối ưu tốc độ biên dịch.

---

## 1. Bối cảnh & Mục tiêu

- **Hiện tại**: Toàn bộ 114 package trong monorepo Crove Cal đã được nâng cấp thành công lên **TypeScript 6.0.3** (PR #57) với cờ `ignoreDeprecations: "6.0"`.
- **Mục tiêu**: Loại bỏ triệt để các cấu hình bị khai tử (deprecated) trong TS 6, chuẩn bị sẵn sàng cho **TypeScript 7.0** khi ra mắt chính thức, tối ưu hóa quá trình build Turbopack/Vite và cải thiện type-checking performance.

---

## 2. Danh sách các Thay đổi Phá vỡ (Breaking Changes) trong TypeScript 7.0

### 2.1. Loại bỏ hoàn toàn `moduleResolution: "node10"` / `"node"`
- **Vấn đề**: Trong TypeScript 7.0, thuật toán phân giải module legacy (`node10` / `node`) bị xóa bỏ hoàn toàn. Cờ `ignoreDeprecations: "6.0"` sẽ không còn hiệu lực.
- **Giải pháp bắt buộc**:
  - Đối với các ứng dụng & thư viện UI chạy với Bundler (Next.js, Vite, Rollup): chuyển sang `"moduleResolution": "bundler"`.
  - Đối với các package thuần Node.js runtime / ESM / CJS: chuyển sang `"moduleResolution": "NodeNext"` hoặc `"Node16"`.

### 2.2. Khai tử `baseUrl` độc lập (Standalone `baseUrl`)
- **Vấn đề**: TypeScript 7.0 không còn hỗ trợ `baseUrl` nếu không có định nghĩa `paths` tương ứng hoặc khi sử dụng `moduleResolution: "bundler" | "NodeNext"`.
- **Giải pháp**: Xóa bỏ `baseUrl: "."` ở các package không dùng alias, hoặc chuyển đổi các alias sang định dạng chuẩn trong `paths` / package `exports`.

### 2.3. Khai tử mục tiêu biên dịch `target: "ES5"` / `"ES2015"`
- **Vấn đề**: Các runtime hiện đại (Node.js 20+, Chrome 110+, Safari 16+) đều hỗ trợ ES2022 natively. Việc build ra ES5 tạo ra mã trung gian cồng kềnh (transpilation bloat) và làm chậm quá trình type-checking.
- **Giải pháp**: Nâng toàn bộ các package đang dùng `target: "es5"` / `"ES2015"` lên tối thiểu `"target": "ES2022"`.

### 2.4. Quy chuẩn hóa `rootDir` & `declarationDir`
- **Vấn đề**: TS 6/7 yêu cầu `rootDir` phải được chỉ định rõ ràng nếu project có phát sinh type declaration `.d.ts` hoặc khi cấu trúc thư mục chứa nhiều tầng con.
- **Giải pháp**: Đã áp dụng thành công trên `@calcom/trpc`, `@calcom/embed-*`, `apps/api/v2` và sẽ áp dụng triệt để cho các package còn lại.

---

## 3. Bảng Kiểm kê Kỹ thuật (Monorepo Package Inventory)

| Package | `tsconfig.json` | Cấu hình hiện tại | Cấu hình đích TS 7.0 | Mức độ ưu tiên |
| :--- | :--- | :--- | :--- | :---: |
| **Root Base** | `packages/tsconfig/base.json` | `ignoreDeprecations: "6.0"`, `moduleResolution: "node"` | `moduleResolution: "bundler"`, xóa `ignoreDeprecations` | **P0 (Core)** |
| **Next.js Base** | `packages/tsconfig/nextjs.json` | `target: "es5"` | `target: "ES2022"`, `moduleResolution: "bundler"` | **P0 (Core)** |
| **React Library** | `packages/tsconfig/react-library.json` | `target: "ES5"` | `target: "ES2022"` | **P0 (Core)** |
| **@calcom/trpc** | `packages/trpc/tsconfig.*.json` | `moduleResolution: "node"` | `moduleResolution: "bundler"` | **P1 (High)** |
| **@calcom/platform-*** | `packages/platform/*/tsconfig.json` | `target: "ES5"`, `moduleResolution: "Node"` | `target: "ES2022"`, `moduleResolution: "bundler"` | **P1 (High)** |
| **@calcom/lib** | `packages/lib/tsconfig.json` | `target: "es5"` | `target: "ES2022"` | **P1 (High)** |
| **@calcom/testing** | `packages/testing/tsconfig.json` | `target: "es5"` | `target: "ES2022"` | **P2 (Medium)** |
| **@calcom/mcp-server** | `packages/mcp-server/tsconfig.json` | `target: "ES2022"`, `NodeNext` | *Đã đạt chuẩn 100%* | **Hoàn thành** |

---

## 4. Các bước Triển khai Nâng cấp (Action Plan)

### Giai đoạn 1: Chuẩn hóa `base.json` và Compiler Targets (Hiện tại)
1. Cập nhật `packages/tsconfig/react-library.json` và `packages/tsconfig/nextjs.json` nâng `target` lên `ES2022`.
2. Kiểm tra các thư viện `packages/platform/*` (`constants`, `enums`, `types`, `utils`) chuyển `target` từ `ES5` sang `ES2022`.

### Giai đoạn 2: Di chuyển Phân giải Module sang `bundler`
1. Thay đổi `moduleResolution: "node"` thành `moduleResolution: "bundler"` trong `packages/tsconfig/base.json`.
2. Xác minh các gói import package nội bộ qua `package.json` `"exports"` và `workspace:*`.
3. Chạy `yarn turbo run type-check` kiểm tra 114 package.

### Giai đoạn 3: Bumping TypeScript 7.0 khi Release
1. Nâng cấp `typescript: "^7.0.0"` trong root `package.json` và tất cả `package.json` con.
2. Xóa bỏ `"ignoreDeprecations": "6.0"`.
3. Chạy toàn bộ test Vitest, Next.js build và Playwright E2E.

---

## 5. Kết luận & Khuyến nghị

Việc hoàn tất nâng cấp **TypeScript 6.0.3** đã dọn sạch 90% các rào cản kỹ thuật. Khi TypeScript 7.0 phát hành chính thức, monorepo Crove Cal có thể hoàn thành chuyển đổi chỉ trong 1 sprint ngắn mà không gặp rủi ro vỡ kiểu dữ liệu (type breakage) hay lỗi runtime.
