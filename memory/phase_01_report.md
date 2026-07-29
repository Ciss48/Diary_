# Phase 01 Report — Foundation + Auth

**Date completed:** 2026-07-28

---

## What was done

1. Scaffolded Next.js 16.2.12 (App Router, TypeScript, Tailwind, ESLint, src-dir)
   vào thư mục dự án hiện có (chứa tài liệu sẵn).
2. Cài `@supabase/ssr` và `@supabase/supabase-js`.
3. Tạo 3 Supabase helper: `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts`.
4. Tạo `middleware.ts` gốc project với route protection logic (chưa login → /login;
   đã login vào /login → /).
5. Tạo `/login` page (Google OAuth), `/auth/callback` route handler,
   `/` home page (server component, protected), `SignOutButton` client component.
6. Áp dụng migration thay thế (do Supabase project dùng chung):
   - ADD COLUMN `avatar_url` vào `profiles`
   - UPDATE trigger `handle_new_user` để set `avatar_url`
7. Tạo `.gitignore`, `.env.example`.
8. Fix tên package (`diary_tmp` → `diary`), thêm `turbopack.root` vào next.config.ts.

---

## Results & Deliverables

- `npm run build` — thành công, không warning.
- `npm run dev` — chạy tại `localhost:3000`.
- GET `/` khi chưa login → 307 redirect về `/login` ✓
- GET `/login` → 200 ✓
- Middleware hoạt động (Next.js 16 gọi là "ƒ Proxy").
- Không có secret hardcode trong source code ✓
- `.env.local` nằm trong `.gitignore` (pattern `.env*`) ✓
- `.env.example` tồn tại, không chứa giá trị thật ✓

**Chưa verify bằng browser (cần user làm):**
- Đăng nhập Google end-to-end
- Kiểm tra row trong Supabase Table Editor (`profiles` có đúng row, timezone đúng)
- Đăng xuất và kiểm tra redirect

---

## New Findings

1. **Next.js 16 thay vì 15** (Moderate) — `create-next-app@latest` cài 16.2.12.
   `middleware.ts` vẫn hoạt động (Edge runtime). Chi tiết: `discoveries.md`.

2. **Supabase project dùng chung với discipline tracker** (Moderate) — bảng
   `profiles` đã tồn tại với schema khác. Xử lý bằng ALTER TABLE + UPDATE
   FUNCTION. Bảng `goals`, `check_ins` của project kia còn nguyên, không đụng.

---

## Decisions made along the way

- Giữ `middleware.ts` (không đổi sang `proxy.ts`) vì:
  (a) task file Interface Contract chỉ định `middleware.ts`,
  (b) Next.js 16 vẫn hỗ trợ, chạy Edge runtime phù hợp với @supabase/ssr.
- Migration thay thế thay vì migration gốc: an toàn với data discipline tracker.
- `turbopack.root = __dirname` để tránh warning do có package-lock.json ở `/Users/vudung/`.

---

## Open issues

- **Browser flow chưa test end-to-end** — user cần vào `localhost:3000/login`,
  đăng nhập Google, xác nhận row trong Supabase Table Editor.
- Supabase Auth cần có `http://localhost:3000/auth/callback` trong Redirect URLs
  (user cần check trong dashboard: Authentication → URL Configuration).
- 2 rows hiện có trong `profiles` (từ discipline tracker) có `avatar_url = NULL` —
  bình thường, home page của Diary xử lý gracefully (`profile?.avatar_url`).

---

## Input for the next phase (Phase 2)

- Schema hiện tại của `profiles`: id, display_name, avatar_url, timezone,
  week_start, created_at. Phase 2 tạo bảng `entries` — tránh đặt tên trùng
  với `goals`, `check_ins` (của discipline tracker).
- Helper `createClient()` (server) trả về `Promise<SupabaseClient>` — phải
  `await` khi dùng.
- Middleware bảo vệ mọi route ngoại trừ `/login` và `/auth/*` — Phase 2
  không cần thêm bảo vệ route.
- File `src/lib/dates.ts` chưa tạo — Phase 2 phải tạo helper timezone này
  trước khi viết bất kỳ logic ngày nào.
