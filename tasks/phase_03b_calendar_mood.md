# Phase 03b: Month calendar + Mood

## Context Recap
Phase 01–03 đã xong (xem `memory/phase_03_report.md`): Next.js 16 + Supabase
auth, bảng `profiles` và `entries`, trang `/diary/[date]` với `DiaryEditor.tsx`
(autosave 1500ms + onBlur), trang chủ `/` có `StatsBar` + `HeatmapGrid` (53
tuần, 4 state, tuần Hai→CN) và các pure function trong `src/lib/streaks.ts`
(`previousDay`, `nextDay`, `computeStats`, `buildHeatmapWeeks`) với
`scripts/test_streaks.mjs` pass 32/32.

Phase này bổ sung theo yêu cầu mới của user:
1. **Lịch tháng** bên dưới heatmap — heatmap tốt cho việc nhìn nhịp độ, nhưng
   không trả lời được "ngày 12 tôi viết gì". Hai view bổ sung nhau, KHÔNG thay
   thế nhau.
2. **Mood** (happy / normal / sad) cho mỗi entry, hiển thị như một dấu hiệu phụ
   trên ô lịch tháng.

**Không có MCP tới Supabase.** Mọi SQL phải đưa user chạy tay rồi chờ kết quả
(CLAUDE.md, luật đầu tiên).

## Goal
Trang chủ có thêm lịch tháng điều hướng được (prev/next month qua URL), mỗi ô
thể hiện đủ 4 state cũ cộng một chấm màu mood. Trang viết nhật ký có mood
picker ở header. Mood lưu xuống DB và phản ánh lên lịch.

## Non-goals
- KHÔNG đụng vào `HeatmapGrid.tsx` và KHÔNG thêm mood vào heatmap năm — ô quá
  nhỏ, nhồi hai tầng thông tin sẽ thành nhiễu. Heatmap giữ nguyên y hệt.
- KHÔNG đổi `computeStats` — mood không ảnh hưởng streak hay thống kê nào.
- KHÔNG làm ảnh (Phase 4), KHÔNG làm AI suggest (Phase 5).
- KHÔNG thêm mood thứ tư, KHÔNG dùng emoji picker, KHÔNG animation.
- KHÔNG cài package mới (không date lib, không icon lib — dùng SVG inline hoặc
  ký tự thuần).
- KHÔNG làm year picker cho lịch tháng; chỉ prev/next từng tháng.

## Interface Contract

### Migration `supabase/migrations/0003_entry_mood.sql`
```sql
alter table public.entries
  add column if not exists mood text;

alter table public.entries
  drop constraint if exists entries_mood_check;

alter table public.entries
  add constraint entries_mood_check
  check (mood is null or mood in ('happy', 'normal', 'sad'));
```
Không cần đổi RLS — policy hiện có đã phủ toàn bảng.
Sau khi viết file này → **DỪNG**, đưa user chạy trong SQL Editor, chờ xác nhận.

### `src/lib/streaks.ts` — mở rộng type (KHÔNG đổi logic sẵn có)
```ts
export type Mood = 'happy' | 'normal' | 'sad';

// Thêm field OPTIONAL vào EntryLite để test_streaks.mjs hiện có vẫn pass
// nguyên trạng, không phải sửa fixture:
export type EntryLite = {
  date: string;
  isBackfill: boolean;
  wordCount: number;
  mood?: Mood | null;      // ← mới
};
```

### `src/lib/calendar.ts` — file MỚI, pure functions, không import Supabase
```ts
import type { EntryLite, CellState, Mood } from './streaks';

export type MonthCell = {
  date: string;          // 'YYYY-MM-DD'
  dayOfMonth: number;    // 1..31
  inMonth: boolean;      // false = ô đệm thuộc tháng liền kề
  state: CellState;      // 'future' | 'empty' | 'ontime' | 'backfill'
  mood: Mood | null;
  wordCount: number;
};

/** 'YYYY-MM' hợp lệ? (month 01..12) */
export function isValidMonthString(monthStr: string): boolean;

/** 'YYYY-MM' → tháng trước / tháng sau, đúng qua ranh giới năm. */
export function previousMonth(monthStr: string): string;
export function nextMonth(monthStr: string): string;

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthOf(dateStr: string): string;

/** Dựng lưới lịch tháng.
 *  - LUÔN trả về đúng 6 tuần × 7 ô = 42 ô (chiều cao ổn định, không nhảy layout).
 *  - Tuần bắt đầu thứ Hai, kết thúc Chủ Nhật (thống nhất với HeatmapGrid).
 *  - Ô đầu tiên là thứ Hai của tuần chứa ngày 1 của tháng đó.
 *  - inMonth = false cho ô đệm thuộc tháng trước/sau; các ô này VẪN tính state
 *    và mood bình thường (user vẫn click sang được).
 *  - state: date > today → 'future'; có entry → 'ontime' | 'backfill' theo
 *    isBackfill; còn lại → 'empty'.
 *  - mood: lấy từ entry nếu có, ngược lại null.
 */
export function buildMonthGrid(
  entries: EntryLite[],
  monthStr: string,
  today: string
): MonthCell[][];
```

### `scripts/test_calendar.mjs`
Node thuần, `node:assert`, in tên từng case, `process.exit(1)` khi fail.
**Fixture bắt buộc:**

`isValidMonthString`: `'2026-07'`→true, `'2026-13'`→false, `'2026-7'`→false,
`'2026-07-01'`→false, `'abc'`→false.

`previousMonth` / `nextMonth`:
| Input | previousMonth | nextMonth |
|---|---|---|
| `2026-07` | `2026-06` | `2026-08` |
| `2026-01` | `2025-12` | `2026-02` |
| `2026-12` | `2026-11` | `2027-01` |

`buildMonthGrid('2026-07', today='2026-07-28')`
(ngày 2026-07-01 là thứ Tư, 2026-07-28 là thứ Ba):
- Trả về đúng 6 mảng, mỗi mảng đúng 7 ô (tổng 42).
- Ô đầu tiên: date `2026-06-29`, dayOfMonth 29, inMonth **false**.
- Ô cuối cùng: date `2026-08-09`, inMonth **false**.
- Ô `2026-07-01`: dayOfMonth 1, inMonth true.
- Ô `2026-07-29` → state `'future'`; `2026-07-28` → không phải future.
- Toàn bộ 42 ô có ngày liên tiếp, không trùng, không đứt quãng.
- Với entries = `[{date:'2026-07-20', isBackfill:false, wordCount:5, mood:'happy'}]`:
  ô `2026-07-20` có state `'ontime'`, mood `'happy'`, wordCount 5;
  ô `2026-07-21` có state `'empty'`, mood `null`, wordCount 0.

`buildMonthGrid('2024-02', today='2026-07-28')` — năm nhuận:
- Ô đầu tiên là `2024-01-29` (01-02 là thứ Năm) và là thứ Hai.
- Tồn tại ô `2024-02-29` với inMonth true.
- Không có ô nào state `'future'` (tháng này ở quá khứ so với today).

`buildMonthGrid('2026-11', today='2026-07-28')` — tháng tương lai:
- Mọi ô inMonth true đều có state `'future'`.

### `src/lib/entries.ts` — bổ sung
```ts
import type { Mood } from './streaks';

// 1) Thêm `mood: Mood | null` vào type Entry.
// 2) saveEntry: thêm tham số CUỐI CÙNG `mood?: Mood | null`.
//    - Nhánh INSERT: ghi mood vào row mới (null nếu không truyền).
//    - Nhánh UPDATE: chỉ ghi mood khi tham số !== undefined.
//    - Luật is_backfill set-một-lần và luật không-dùng-upsert GIỮ NGUYÊN.
// 3) Hàm mới:

/** Chỉ UPDATE mood của entry đã tồn tại. Nếu chưa có entry cho ngày đó →
 *  trả về null và KHÔNG tạo row mới (tránh sinh entry rỗng làm sáng heatmap). */
export async function updateMood(date: string, mood: Mood | null): Promise<Entry | null>;
```
Trước khi sửa, ĐỌC signature `saveEntry` hiện tại trong file và giữ nguyên các
tham số cũ theo đúng thứ tự — chỉ thêm vào cuối.

### `src/components/MoodPicker.tsx` — mới, `'use client'`
```
Props: { value: Mood | null; onChange: (m: Mood | null) => void; disabled?: boolean }
```
- 3 nút tròn nhỏ nằm ngang: Happy / Normal / Sad.
- Màu khi được chọn: happy `bg-amber-400`, normal `bg-stone-300`,
  sad `bg-blue-400`. Khi chưa chọn: viền `border-stone-300`, nền trong suốt.
- Bấm lại đúng nút đang chọn → bỏ chọn (`onChange(null)`).
- Mỗi nút có `title` và `aria-label` ("Happy" / "Normal" / "Sad").

### `src/components/DiaryEditor.tsx` — sửa
**Vị trí mood picker: ở HEADER, cùng hàng với ngày và badge backfill — KHÔNG
đặt dưới textarea.** Lý do (ghi lại để không bị đổi ở phase sau): Phase 5 sẽ đổ
khối so sánh side-by-side + feedback card xuống dưới textarea; mood đặt ở đó sẽ
bị đẩy khuất hoặc kẹt giữa hai khối AI. Mood là metadata của ngày, cùng họ với
ngày tháng và badge backfill.

Logic:
- Thêm state `mood: Mood | null`, khởi tạo từ entry đã fetch.
- Khi user chọn mood:
  - Nếu entry đã tồn tại → gọi `updateMood(date, mood)` ngay, cập nhật
    `saveStatus` như luồng save hiện có.
  - Nếu entry CHƯA tồn tại → chỉ set state cục bộ; mood sẽ được truyền vào
    lần `saveEntry` đầu tiên (nhánh INSERT).
- Không được tạo entry rỗng chỉ vì user bấm mood.

### `src/components/MonthCalendar.tsx` — mới, server component (KHÔNG `'use client'`)
```
Props: { weeks: MonthCell[][]; monthStr: string; today: string;
         canGoNext: boolean }
```
- Header: tên tháng + năm (`Intl.DateTimeFormat('en-US', {month:'long', year:'numeric'})`
  trên `Date.UTC(...)`), nút `‹` `›` là `<Link href={/?month=YYYY-MM}>`.
  Nút `›` render dạng disabled (`<span>`, mờ) khi `canGoNext === false`.
- Hàng nhãn thứ: Mon Tue Wed Thu Fri Sat Sun.
- Ô lịch (`aspect-square`, số ngày ở góc trên trái):
  - `future`: `bg-stone-50 text-stone-300`, render `<div>`, không phải Link.
  - `empty`: `bg-white border border-stone-200 text-stone-600`
  - `ontime`: `bg-emerald-50 border border-emerald-400 text-emerald-900`
  - `backfill`: `bg-emerald-50/60 border border-dashed border-emerald-400 text-emerald-900`
  - `inMonth === false`: thêm `opacity-40`
  - `date === today`: thêm `ring-2 ring-amber-500`
- **Chấm mood** ở góc TRÊN PHẢI của ô, `h-1.5 w-1.5 rounded-full`:
  happy → `bg-amber-400`; sad → `bg-blue-400`; normal hoặc null → không render.
- Legend bên dưới: 4 state (dùng lại nhãn của heatmap) + 2 chấm mood
  (Happy / Sad) kèm ghi chú "Normal = no dot".

### `src/app/page.tsx` — sửa
- Next.js 16: `searchParams` là Promise → **phải `await`**.
- `monthStr = searchParams.month` nếu `isValidMonthString` hợp lệ, ngược lại
  `monthOf(today)`.
- Chặn tương lai: nếu `monthStr > monthOf(today)` → dùng `monthOf(today)`.
- `canGoNext = monthStr < monthOf(today)`.
- Map entries sang `EntryLite[]` (nhớ thêm `mood`), gọi `buildMonthGrid`.
- Thứ tự render: StatsBar → HeatmapGrid (giữ nguyên) → **MonthCalendar** →
  "Write today's entry".
- Query entries: thêm `mood` vào danh sách cột select.

## Steps
1. Viết migration `0003_entry_mood.sql` → DỪNG, đưa user chạy, chờ xác nhận.
2. Mở rộng type trong `streaks.ts` (chỉ thêm field optional).
3. Viết `src/lib/calendar.ts` + `scripts/test_calendar.mjs`; chạy tới khi pass.
4. Chạy lại `node scripts/test_streaks.mjs` và `node scripts/test_dates.mjs` —
   cả hai phải vẫn pass nguyên trạng (chứng minh không phá gì).
5. Sửa `src/lib/entries.ts` (đọc signature cũ trước khi thêm tham số).
6. Viết `MoodPicker.tsx`, sửa `DiaryEditor.tsx`.
7. Viết `MonthCalendar.tsx`, sửa `src/app/page.tsx`.
8. `npm run build` sạch.
9. Soạn SQL seed cho user verify (mục DoD), chờ kết quả, đối chiếu UI.
10. Handoff Obligations.

## Definition of Done
- [ ] `node scripts/test_dates.mjs`, `node scripts/test_streaks.mjs`,
      `node scripts/test_calendar.mjs` — cả ba pass 100%.
- [ ] `npm run build` thành công, không warning.
- [ ] Trang `/` hiển thị theo thứ tự: stats → heatmap 53 tuần (KHÔNG đổi so với
      Phase 3) → lịch tháng hiện tại → nút viết.
- [ ] Bấm `‹` → URL thành `/?month=YYYY-MM` của tháng trước, lịch đổi đúng;
      bấm `›` quay lại. Ở tháng hiện tại, nút `›` bị vô hiệu hoá.
- [ ] Vào `/?month=2026-13` hoặc `/?month=abc` → không crash, hiện tháng hiện tại.
- [ ] Vào `/?month=2027-01` (tương lai) → hiện tháng hiện tại, không crash.
- [ ] Mở `/diary/<hôm nay>`, mood picker nằm ở header cạnh ngày. Viết nội dung,
      chờ save, chọn Happy → chấm vàng xuất hiện ở ô hôm nay trên lịch tháng
      sau khi refresh `/`.
- [ ] Chọn Sad → chấm chuyển xanh dương; chọn Normal → không có chấm; bấm lại
      nút đang chọn → bỏ chọn, không có chấm.
- [ ] Mở `/diary/<một ngày quá khứ chưa có entry>`, bấm mood TRƯỚC khi gõ chữ →
      user chạy `select count(*) from entries where entry_date = '<ngày đó>';`
      trả về **0** (không sinh entry rỗng). Sau đó gõ nội dung, chờ save →
      row được tạo và ĐÃ có mood vừa chọn.
- [ ] User chạy SQL kiểm tra constraint:
      `insert into public.entries (user_id, entry_date, content, word_count, is_backfill, mood)
       values ('<UID>', '2020-01-01', 'x', 1, true, 'angry');`
      → phải BỊ TỪ CHỐI bởi `entries_mood_check`.
- [ ] Ô lịch của ngày backfill vẫn giữ viền đứt; ô có mood vừa có nền theo state
      vừa có chấm mood (hai thông tin không đè nhau).
- [ ] User dọn toàn bộ dữ liệu test sau khi verify.

## Handoff Obligations
1. Viết `memory/phase_03b_report.md`, liệt kê **từng mục** DoD kèm trạng thái
   thật (verified / not verified / blocked vì lý do gì). Không tick mục chưa
   thực sự kiểm tra.
2. Ghi đè toàn bộ `memory/STATE.md`. Ghi rõ schema `entries` đã có cột `mood`.
3. Discovery Moderate/Major → `memory/discoveries.md`; Major thì dừng phase sớm.
4. Trong "Input for the next phase": mô tả cấu trúc `DiaryEditor.tsx` SAU khi
   sửa (Phase 4 cần biết chỗ chèn photo strip — vẫn là dưới textarea, trên
   footer word-count, nay đã có thêm mood picker ở header).
