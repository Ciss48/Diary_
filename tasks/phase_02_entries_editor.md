# Phase 02: Data model + Trang viết nhật ký

## Context Recap
Phase 01 đã xong: Next.js 15 + Supabase auth Google hoạt động, bảng `profiles`
tự tạo row khi user mới (xem `memory/phase_01_report.md`). Phase này xây phần
lõi của sản phẩm: bảng `entries` và trang viết nhật ký theo ngày, với hai quy
tắc nghiệp vụ quan trọng nhất dự án — timezone và backfill (xem
`docs/plan.md` mục 1). Nếu `docs/design/` đã có design từ Claude Design thì
bám theo; nếu chưa, làm UI tối giản sạch sẽ.

## Goal
User mở `/diary/2026-07-12` (hoặc ngày quá khứ bất kỳ), viết nội dung, hệ
thống autosave; mở lại thì thấy đúng nội dung cũ; entry ngày quá khứ được đánh
dấu `is_backfill = true` một lần duy nhất lúc tạo; ngày tương lai bị chặn.

## Non-goals
- KHÔNG làm heatmap/trang chủ calendar (Phase 3) — trang chủ giữ nguyên
  placeholder, chỉ thêm 1 link "Write today's entry" trỏ tới ngày hôm nay.
- KHÔNG làm upload ảnh (Phase 4) — không tạo bảng entry_photos.
- KHÔNG làm AI suggest (Phase 5) — không tạo bảng ai_suggestions, không có nút.
- KHÔNG làm rich-text — textarea thuần.
- KHÔNG cài package mới nào (kể cả date lib — `Intl` là đủ), KHÔNG setup test
  framework (dùng script node thuần theo contract dưới).

## Interface Contract

**Migration `supabase/migrations/0002_entries.sql`:**
```sql
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  content text not null default '',
  word_count integer not null default 0,
  is_backfill boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index entries_user_date_idx on public.entries (user_id, entry_date);

alter table public.entries enable row level security;

create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);
create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id);
create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = user_id);

create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();
```

**`src/lib/dates.ts` (pure functions, không phụ thuộc Supabase):**
```ts
/** Trả về 'YYYY-MM-DD' của "hôm nay" theo timezone cho trước.
 *  Bắt buộc dùng Intl.DateTimeFormat('en-CA', { timeZone: tz }) — 'en-CA' cho
 *  sẵn định dạng YYYY-MM-DD. */
export function getTodayInTimezone(tz: string): string

/** dateStr ('YYYY-MM-DD') có phải ngày tương lai so với hôm nay theo tz? */
export function isFutureDate(dateStr: string, tz: string): boolean

/** dateStr có đúng định dạng YYYY-MM-DD và là ngày hợp lệ trên lịch? */
export function isValidDateString(dateStr: string): boolean

/** Đếm từ: content.trim().split(/\s+/).filter(Boolean).length; chuỗi rỗng → 0 */
export function countWords(content: string): number
```

**`src/lib/entries.ts` (client-side, dùng browser client; RLS lo an toàn):**
```ts
export type Entry = {
  id: string;
  entry_date: string;      // 'YYYY-MM-DD'
  content: string;
  word_count: number;
  is_backfill: boolean;
  created_at: string;
  updated_at: string;
};

/** null nếu ngày đó chưa có entry */
export async function fetchEntry(date: string): Promise<Entry | null>

/** Nếu entry đã tồn tại → UPDATE content + word_count (KHÔNG đụng is_backfill).
 *  Nếu chưa → INSERT với is_backfill = (date < getTodayInTimezone(tz)).
 *  tz truyền từ profiles.timezone. KHÔNG dùng upsert mù — phải tách 2 nhánh
 *  để bảo toàn luật is_backfill-set-một-lần. */
export async function saveEntry(date: string, content: string, tz: string): Promise<Entry>
```

**Routes/components:**
```
src/app/diary/[date]/page.tsx
  // server component: validate date param bằng isValidDateString → sai thì notFound();
  // đọc profiles.timezone; isFutureDate → redirect('/');
  // render <DiaryEditor date={date} timezone={tz} />

src/components/DiaryEditor.tsx  ('use client')
  // - mount: fetchEntry(date), hiển thị content
  // - header: ngày định dạng đẹp (vd "Saturday, July 12, 2026");
  //   nếu entry.is_backfill (hoặc sẽ là backfill vì date < hôm nay) → tag nhỏ "backfilled"
  // - textarea + word count live (countWords)
  // - autosave: debounce 1500ms sau lần gõ cuối + save khi blur;
  //   indicator 3 trạng thái: "Saving…" / "Saved" / "Error – retry"
  // - không save khi content không đổi
```

**Trang chủ:** thêm link `Write today's entry` → `/diary/${getTodayInTimezone(tz)}`
(tz đọc từ profiles của user, server-side).

**Script kiểm chứng `scripts/test_dates.mjs`** (node thuần, assert, exit 1 nếu
fail) cho các case tối thiểu:
- `countWords('')===0`, `countWords('  ')===0`, `countWords('hello world')===2`,
  `countWords('a\nb\tc')===3`
- `isValidDateString('2026-07-12')===true`, `('2026-13-01')===false`,
  `('2026-02-30')===false`, `('12/07/2026')===false`
- `isFutureDate` với tz `Asia/Ho_Chi_Minh`: ngày hôm qua → false, ngày mai → true
  (tính động từ `getTodayInTimezone`)
- `getTodayInTimezone('Asia/Ho_Chi_Minh')` khớp regex `^\d{4}-\d{2}-\d{2}$`
- Case chứng minh khác UTC: với tz `Pacific/Kiritimati` (UTC+14) và
  `Pacific/Niue` (UTC-11), hai giá trị getTodayInTimezone có thể khác nhau —
  assert cả hai đều hợp lệ và KHÔNG dùng cùng một mốc UTC cứng.

## Steps
1. Viết migration `0002_entries.sql` → **DỪNG**, yêu cầu user chạy trong SQL
   Editor và xác nhận (luật CLAUDE.md).
2. Viết `src/lib/dates.ts` + `scripts/test_dates.mjs`; chạy
   `node scripts/test_dates.mjs` đến khi pass toàn bộ.
3. Viết `src/lib/entries.ts` đúng contract (đặc biệt logic 2 nhánh insert/update).
4. Viết `src/app/diary/[date]/page.tsx` + `DiaryEditor.tsx`.
5. Thêm link "Write today's entry" ở trang chủ.
6. Tự chạy toàn bộ Definition of Done; mục nào cần thao tác trên browser thì
   hướng dẫn user thao tác và chờ xác nhận.
7. Handoff Obligations.

## Definition of Done
- [ ] `node scripts/test_dates.mjs` pass 100%; `npm run build` thành công.
- [ ] Mở `/diary/<hôm nay>` viết "Hello world from today", chờ 2s, refresh →
      nội dung còn nguyên; Table Editor cho thấy `is_backfill=false`,
      `word_count=4`.
- [ ] Mở `/diary/<hôm qua>` viết nội dung → row mới có `is_backfill=true`;
      UI hiện tag "backfilled".
- [ ] Sửa tiếp entry hôm qua rồi save → vẫn `is_backfill=true`, KHÔNG có row
      thứ hai (unique constraint được tôn trọng, update chứ không insert).
- [ ] Mở `/diary/<ngày mai>` → bị redirect về `/`.
- [ ] Mở `/diary/2026-13-99` và `/diary/abc` → 404.
- [ ] Kiểm tra RLS: trong SQL Editor chạy
      `select count(*) from entries;` với role mặc định (dashboard bypass RLS
      nên chỉ để đối chiếu tổng); sau đó đăng nhập bằng tài khoản Google thứ
      hai trên trình duyệt ẩn danh, vào `/diary/<hôm nay>` → KHÔNG thấy nội
      dung của tài khoản thứ nhất (user xác nhận).
- [ ] Word count trên UI cập nhật theo thời gian thực khi gõ.

## Handoff Obligations
1. Viết `memory/phase_02_report.md` (What was done / Results / New findings /
   Decisions / Open issues / Input for next phase — phase 3 sẽ cần biết cách
   query entries theo range ngày hiệu quả).
2. Ghi đè `memory/STATE.md`.
3. Discovery Moderate/Major → `memory/discoveries.md` theo protocol; Major thì
   dừng phase và báo user.
