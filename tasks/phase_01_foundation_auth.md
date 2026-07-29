# Phase 01: Foundation + Auth

## Context Recap
Dự án Diary (xem `docs/plan.md`): app học tiếng Anh qua nhật ký, stack Next.js
15 App Router + TypeScript + Tailwind + Supabase. Đây là phase đầu tiên — repo
hiện chỉ có bộ tài liệu (CLAUDE.md, docs/, tasks/, memory/), chưa có code.
Supabase project đã được user tạo sẵn: Google OAuth đã bật, `.env.local` đã có
`NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` (không hỏi, không
in giá trị).

## Goal
App Next.js chạy local với luồng auth trọn vẹn: đăng nhập Google → tự có row
trong `profiles` → vào trang chủ (placeholder) → đăng xuất. Route được bảo vệ
bằng middleware.

## Non-goals
- KHÔNG làm UI nhật ký, editor, heatmap — placeholder trang chủ là đủ.
- KHÔNG tạo bảng nào ngoài `profiles`.
- KHÔNG styling cầu kỳ — Tailwind mặc định, layout sạch là đủ (polish ở Phase 6).
- KHÔNG cài thêm package ngoài danh sách trong Interface Contract.
- KHÔNG setup testing framework, CI, linting config tùy chỉnh.

## Interface Contract

**Khởi tạo project (tại gốc repo hiện tại — không tạo thư mục con):**
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
npm install @supabase/supabase-js @supabase/ssr
```
Lưu ý: create-next-app có thể phàn nàn thư mục không rỗng vì đã có CLAUDE.md,
docs/, tasks/, memory/ — nếu vậy, scaffold ra thư mục tạm rồi move vào, giữ
nguyên các file tài liệu. Đảm bảo `.gitignore` chứa `.env.local` và `.env*`.

**Files phải tạo (đúng đường dẫn, đúng tên export):**

```
src/lib/supabase/client.ts
  export function createClient(): SupabaseClient        // browser client, dùng createBrowserClient của @supabase/ssr

src/lib/supabase/server.ts
  export async function createClient(): Promise<SupabaseClient>  // server client, dùng createServerClient + cookies() của next/headers

src/lib/supabase/middleware.ts
  export async function updateSession(request: NextRequest): Promise<NextResponse>

middleware.ts (gốc project)
  // gọi updateSession; matcher loại trừ _next/static, _next/image, favicon, ảnh public
  // logic: chưa đăng nhập và không ở /login|/auth → redirect /login
  //        đã đăng nhập mà vào /login → redirect /

src/app/login/page.tsx
  // nút "Continue with Google" → supabase.auth.signInWithOAuth({ provider: 'google',
  //   options: { redirectTo: `${location.origin}/auth/callback` } })

src/app/auth/callback/route.ts
  // GET: exchangeCodeForSession(code) rồi redirect về '/'

src/app/page.tsx
  // server component, protected: hiện display_name + avatar từ profiles,
  // chữ "Calendar coming soon (Phase 3)", nút Sign out (client component nhỏ
  // src/components/SignOutButton.tsx gọi supabase.auth.signOut() rồi về /login)

.env.example
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

**Migration `supabase/migrations/0001_profiles.sql`:**
```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Row tự tạo khi có user mới (không cần policy insert cho client)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## Steps
1. Scaffold Next.js theo lệnh trên; xác nhận `npm run dev` chạy được trang mặc định.
2. Viết migration `0001_profiles.sql` → **DỪNG LẠI**, yêu cầu user chạy trong
   Supabase SQL Editor và xác nhận đã chạy xong (theo luật Migrations trong
   CLAUDE.md). Chỉ tiếp tục sau khi user xác nhận.
3. Tạo 3 file supabase client/server/middleware helper + `middleware.ts` gốc.
4. Tạo `/login`, `/auth/callback`, trang chủ protected + SignOutButton.
5. Tự kiểm tra từng mục trong Definition of Done, sửa đến khi đạt.
6. Thực hiện Handoff Obligations.

## Definition of Done
- [ ] `npm run dev` khởi động không lỗi; `npm run build` thành công.
- [ ] Truy cập `/` khi chưa đăng nhập → bị đưa về `/login`.
- [ ] Bấm "Continue with Google" → chọn tài khoản → quay về `/` với
      display_name + avatar hiển thị đúng.
- [ ] Trong Supabase Table Editor, bảng `profiles` có đúng 1 row cho user vừa
      đăng nhập, `timezone = 'Asia/Ho_Chi_Minh'` (user kiểm tra và xác nhận).
- [ ] Bấm Sign out → về `/login`; truy cập lại `/` vẫn bị chặn.
- [ ] Đã đăng nhập mà vào `/login` → tự redirect về `/`.
- [ ] `git status` không thấy `.env.local` (nằm trong .gitignore);
      `.env.example` tồn tại và không chứa giá trị thật.
- [ ] Không có secret nào bị hardcode trong source (grep chuỗi URL/key để chắc).

## Handoff Obligations
1. Viết `memory/phase_01_report.md` gồm các mục: What was done / Results &
   Deliverables / New findings / Decisions made along the way / Open issues /
   Input for the next phase.
2. Ghi đè toàn bộ `memory/STATE.md` với snapshot hiện tại (thay thế, không append).
3. Nếu có discovery MAJOR (theo protocol trong CLAUDE.md): viết đề xuất vào
   `memory/discoveries.md` và kết thúc phase sớm thay vì tự quyết định.
