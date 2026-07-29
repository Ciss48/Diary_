# Phase 03: Calendar heatmap + Streak

## Context Recap
Phase 01–02 đã xong: Next.js 16 + Supabase auth Google, bảng `profiles`
(id, display_name, avatar_url, timezone, created_at) và `entries`
(id, user_id, entry_date, content, word_count, is_backfill, created_at,
updated_at), trang `/diary/[date]` với autosave hoạt động. Xem
`memory/phase_02_report.md`.

Hai điều quan trọng về môi trường phiên này:
- **Không có MCP tới Supabase.** Bạn không tự chạy được bất cứ thứ gì trên DB.
  Mọi SQL phải đưa cho user chạy tay rồi chờ kết quả (xem CLAUDE.md, luật đầu tiên).
- **Phase 2 để lại nợ kỹ thuật:** `scripts/test_dates.mjs` có thể chưa tồn tại
  và vài mục DoD chưa được xác minh. Step 0 dưới đây xử lý việc đó — Phase 3
  phụ thuộc trực tiếp vào `getTodayInTimezone` và tính đúng của `is_backfill`.

Phase này thay trang chủ placeholder bằng màn hình chính thật của sản phẩm.

## Goal
Trang chủ `/` hiển thị heatmap 53 tuần gần nhất với 4 trạng thái ô phân biệt
được, cùng 4 chỉ số (current streak, longest streak, total entries, total
words). Click vào ô ngày quá khứ/hôm nay → sang `/diary/[date]`. Toàn bộ logic
tính toán nằm trong pure function có test pass 100%.

## Non-goals
- KHÔNG làm ảnh (Phase 4), KHÔNG làm AI suggest (Phase 5) — không tạo bảng mới,
  không thêm migration nào trong phase này.
- KHÔNG làm year picker / điều hướng năm cũ. Chỉ hiển thị 53 tuần gần nhất.
- KHÔNG làm tooltip tùy biến, popover, animation. Dùng thuộc tính `title` của
  HTML là đủ.
- KHÔNG cài package mới (không date lib, không chart lib, không tooltip lib).
- KHÔNG đụng vào `src/app/diary/[date]/page.tsx` hay `DiaryEditor.tsx` trừ khi
  Step 0 phát hiện lỗi thật.
- KHÔNG tối ưu query (fetch toàn bộ entries của user là chấp nhận được ở quy mô
  này — đã ghi trong plan.md mục 4).

## Step 0 — Kiểm tra nợ kỹ thuật Phase 2 (làm TRƯỚC mọi thứ khác)

**0a.** Kiểm tra `scripts/test_dates.mjs` có tồn tại không.
- Nếu có: chạy `node scripts/test_dates.mjs`, phải pass hết.
- Nếu KHÔNG có: viết mới theo đúng contract trong
  `tasks/phase_02_entries_editor.md` (mục Interface Contract → phần script
  kiểm chứng), rồi chạy cho pass. Đây là điều kiện tiên quyết, không được bỏ.

**0b.** Chạy `npm run build`, phải thành công.

**0c.** Đưa user khối SQL sau để xác minh schema, rồi **DỪNG chờ kết quả**:
```sql
-- Kiểm tra cột của profiles và entries
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('profiles','entries')
order by table_name, ordinal_position;

-- Kiểm tra dữ liệu entries hiện có (dùng để đối chiếu heatmap sau này)
select entry_date, is_backfill, word_count
from public.entries
order by entry_date;
```
Xác nhận `profiles` có cột `timezone` và `entries` có `is_backfill`,
`word_count`. Nếu thiếu → discovery Major, dừng phase, báo user.

## Interface Contract

### `src/lib/streaks.ts` — pure functions, không import Supabase, không đọc `Date.now()`

```ts
export type EntryLite = {
  date: string;          // 'YYYY-MM-DD'
  isBackfill: boolean;
  wordCount: number;
};

export type CellState = 'future' | 'empty' | 'ontime' | 'backfill';

export type HeatmapCell = {
  date: string;          // 'YYYY-MM-DD'
  state: CellState;
  wordCount: number;     // 0 nếu không có entry
};

export type Stats = {
  currentStreak: number;
  longestStreak: number;
  totalEntries: number;
  totalWords: number;
};

/** Lùi 1 ngày trên chuỗi 'YYYY-MM-DD'. Thuần lịch, KHÔNG dính timezone:
 *  parse bằng Date.UTC(y, m-1, d), trừ 86400000, format lại bằng các getUTC*.
 *  Phải đúng qua ranh giới tháng, năm và năm nhuận. */
export function previousDay(dateStr: string): string;

/** Tiến 1 ngày, cùng nguyên tắc như previousDay. */
export function nextDay(dateStr: string): string;

/** Tính toàn bộ chỉ số.
 *  LUẬT (đã chốt trong plan.md, không được diễn giải khác):
 *  - Chỉ ngày có entry với isBackfill === false mới tính vào streak.
 *  - Ngày có entry backfill được đối xử Y HỆT ngày trống khi tính streak
 *    (tức là nó LÀM ĐỨT chuỗi).
 *  - currentStreak: nếu `today` là ngày on-time thì đếm lùi từ `today`;
 *    nếu không, đếm lùi từ previousDay(today). Nghĩa là hôm nay chưa viết
 *    thì chuỗi CHƯA đứt (đang ở trạng thái chờ).
 *  - longestStreak: chuỗi on-time liên tiếp dài nhất trong toàn bộ lịch sử.
 *  - totalEntries: đếm TẤT CẢ entries (kể cả backfill).
 *  - totalWords: tổng wordCount của TẤT CẢ entries.
 *  - Hàm phải tự sort đầu vào; không giả định entries đã sắp xếp.
 */
export function computeStats(entries: EntryLite[], today: string): Stats;

/** Dựng lưới heatmap.
 *  - Trả về mảng các TUẦN, cũ → mới. Mỗi tuần là mảng 7 ô, thứ Hai → Chủ Nhật
 *    (quy ước Việt Nam, KHÔNG dùng Chủ Nhật đầu tuần kiểu GitHub).
 *  - Lưới kết thúc ở tuần chứa `today`. Với weeks = 53, ô đầu tiên là thứ Hai
 *    của tuần cách tuần hiện tại 52 tuần.
 *  - Ô có date > today → state 'future'.
 *  - Ô có entry: 'ontime' nếu isBackfill === false, ngược lại 'backfill'.
 *  - Ô không có entry và không phải tương lai → 'empty'.
 */
export function buildHeatmapWeeks(
  entries: EntryLite[],
  today: string,
  weeks: number
): HeatmapCell[][];
```

### `scripts/test_streaks.mjs`
Node thuần, dùng `node:assert`, `process.exit(1)` khi fail, in tên từng case.
**Bắt buộc phủ đúng các fixture sau** (today cố định, không dùng ngày thật):

`previousDay` / `nextDay`:
| Input | previousDay | nextDay |
|---|---|---|
| `2026-07-01` | `2026-06-30` | `2026-07-02` |
| `2026-01-01` | `2025-12-31` | `2026-01-02` |
| `2024-03-01` | `2024-02-29` | `2024-03-02` |
| `2023-03-01` | `2023-02-28` | `2023-03-02` |

`computeStats` — mọi case dùng `today = '2026-07-28'` trừ khi ghi khác.
Ký hiệu: `O` = on-time (isBackfill false), `B` = backfill.

| # | Entries | currentStreak | longestStreak | Ghi chú |
|---|---|---|---|---|
| 1 | (rỗng) | 0 | 0 | user mới |
| 2 | 07-28 O | 1 | 1 | viết hôm nay |
| 3 | 07-27 O | 1 | 1 | hôm nay chưa viết → chuỗi chưa đứt |
| 4 | 07-26 O, 07-27 O, 07-28 O | 3 | 3 | chuỗi liền |
| 5 | 07-26 O, 07-27 O | 2 | 2 | hôm nay chưa viết, vẫn đếm |
| 6 | 07-20..07-22 O, 07-27 O, 07-28 O | 2 | 3 | longest nằm ở quá khứ |
| 7 | 07-26 O, 07-27 B, 07-28 O | 1 | 1 | backfill làm đứt chuỗi |
| 8 | 07-28 B | 0 | 0 | chỉ có backfill |
| 9 | 07-26 O (today 07-28) | 0 | 1 | bỏ lỡ 2 ngày → đứt |
| 10 | 06-30 O, 07-01 O; today `2026-07-01` | 2 | 2 | qua ranh giới tháng |
| 11 | 2024-02-28 O, 2024-02-29 O, 2024-03-01 O; today `2024-03-01` | 3 | 3 | năm nhuận |
| 12 | như case 6 nhưng truyền vào theo thứ tự đảo lộn | 2 | 3 | hàm tự sort |
| 13 | 07-27 O (wordCount 10), 07-28 B (wordCount 5) | 1 | 1 | totalEntries = 2, totalWords = 15 |

`buildHeatmapWeeks` với `today = '2026-07-28'` (thứ Ba), `weeks = 53`:
- Kết quả có đúng 53 phần tử, mỗi phần tử đúng 7 ô.
- Ô cuối cùng của tuần cuối là Chủ Nhật `2026-08-02` và có state `'future'`.
- Ô `2026-07-28` tồn tại trong tuần cuối, ở vị trí index 1 (thứ Ba).
- `2026-07-29` → `'future'`; `2026-07-27` không có entry → `'empty'`.
- Ngày đầu tiên của lưới là một thứ Hai (kiểm tra bằng `Date.UTC(...).getUTCDay() === 1`).
- Không có ô nào bị trùng ngày; các ngày liên tiếp nhau không đứt quãng.

### `src/app/page.tsx` (server component, thay placeholder cũ)
```
- Lấy user + profiles.timezone (server client đã có, nhớ `await createClient()`)
- today = getTodayInTimezone(profile.timezone)
- Query: select entry_date, is_backfill, word_count from entries
         (RLS tự lọc theo user, không cần .eq('user_id', ...))
- Map sang EntryLite[] → computeStats + buildHeatmapWeeks(…, today, 53)
- Render: header (avatar + tên + SignOutButton, giữ nguyên component cũ),
          <StatsBar />, <HeatmapGrid />, link "Write today's entry" → /diary/{today}
```

### `src/components/StatsBar.tsx` (server component)
Nhận `stats: Stats`. Hiển thị 4 ô: Current streak / Longest streak / Total
entries / Total words. Chữ số to, nhãn nhỏ. Tailwind thuần.

### `src/components/HeatmapGrid.tsx` (server component, KHÔNG cần `'use client'`)
Nhận `weeks: HeatmapCell[][]`, `today: string`.
- Lưới CSS: mỗi tuần là 1 cột, 7 hàng (`grid-flow-col`, `grid-rows-7`).
- Ô là `<Link href={/diary/${date}}>` với `title` dạng
  `"2026-07-28 — 120 words"` / `"2026-07-27 — no entry"`.
- Ô `future`: render `<div>` (không phải Link), màu mờ, `pointer-events-none`.
- Màu theo state (dùng Tailwind, chỉnh ở Phase 6 nếu design khác):
  - `empty`: `bg-stone-200`
  - `ontime`: `bg-emerald-500`
  - `backfill`: `bg-emerald-200 border border-dashed border-emerald-500`
  - `future`: `bg-stone-100 opacity-40`
  - ô có `date === today`: thêm `ring-2 ring-amber-500`
- Bọc trong `<div class="overflow-x-auto">`, có legend nhỏ bên dưới giải thích
  4 màu.

## Steps
1. Step 0 (0a, 0b, 0c) — hoàn tất, chờ user xác nhận SQL trước khi đi tiếp.
2. Viết `src/lib/streaks.ts` theo contract.
3. Viết `scripts/test_streaks.mjs` với ĐÚNG các fixture ở trên; chạy tới khi
   pass 100%. Nếu một fixture có vẻ sai, KHÔNG tự sửa fixture — đó là contract
   do architect chốt; báo user như discovery.
4. Viết `StatsBar.tsx`, `HeatmapGrid.tsx`.
5. Viết lại `src/app/page.tsx`.
6. `npm run build` sạch.
7. Soạn SQL để user tạo dữ liệu kiểm thử (xem DoD mục cuối), đưa cho user, chờ
   kết quả, đối chiếu với UI.
8. Handoff Obligations.

## Definition of Done
- [ ] `node scripts/test_dates.mjs` pass 100% (nợ Phase 2 đã trả).
- [ ] `node scripts/test_streaks.mjs` pass 100%, phủ đủ 13 fixture computeStats
      + 4 fixture previousDay/nextDay + 6 assert buildHeatmapWeeks.
- [ ] `npm run build` thành công, không warning về missing key trong list render.
- [ ] Trang `/` hiển thị heatmap 53 cột, cuộn ngang được, ô hôm nay có ring.
- [ ] User chạy khối SQL seed dưới đây, refresh `/`, và xác nhận:
      current streak = 2, longest streak = 3, total entries = 6,
      total words = 60; ô 3 ngày liền tháng trước màu đậm, ô backfill màu nhạt
      viền đứt.
- [ ] Click một ô đã có entry → sang đúng `/diary/<ngày đó>` và thấy nội dung.
- [ ] Click ô ngày tương lai → không xảy ra gì (không phải link).
- [ ] Carry-over từ Phase 2: user đăng nhập bằng tài khoản Google thứ hai (cửa
      sổ ẩn danh) → trang `/` hiện heatmap trống hoàn toàn, stats toàn 0
      (chứng minh RLS chặn chéo user).
- [ ] Sau khi verify xong, user chạy SQL dọn dữ liệu seed.

**SQL seed để user chạy (executor phải điền ngày thật vào chỗ `<...>` dựa trên
ngày hôm nay của user, và đưa kèm SQL dọn):**
```sql
-- Thay <UID> bằng user id lấy từ: select id, display_name from public.profiles;
-- Ý đồ: 3 ngày liên tiếp on-time trong quá khứ xa (longest=3),
--       hôm qua + hôm kia on-time (current=2, vì hôm nay chưa viết),
--       1 ngày backfill để kiểm tra màu.
insert into public.entries (user_id, entry_date, content, word_count, is_backfill)
values
  ('<UID>', '<today-20>', 'seed', 10, false),
  ('<UID>', '<today-19>', 'seed', 10, false),
  ('<UID>', '<today-18>', 'seed', 10, false),
  ('<UID>', '<today-10>', 'seed', 10, true),
  ('<UID>', '<today-2>',  'seed', 10, false),
  ('<UID>', '<today-1>',  'seed', 10, false);
```
```sql
-- Dọn sau khi verify
delete from public.entries where content = 'seed';
```

## Handoff Obligations
1. Viết `memory/phase_03_report.md`. Trong report phải liệt kê **từng mục** DoD
   ở trên kèm trạng thái thật (verified / not verified / blocked vì lý do gì) —
   không tick mục chưa thực sự kiểm tra.
2. Ghi đè toàn bộ `memory/STATE.md`.
3. Discovery Moderate/Major → ghi vào `memory/discoveries.md`; Major thì dừng
   phase sớm và báo user.
4. Ghi rõ trong "Input for the next phase": Phase 4 (ảnh) sẽ cần biết cấu trúc
   hiện tại của `DiaryEditor.tsx` và chỗ nào hợp lý để chèn photo strip.
