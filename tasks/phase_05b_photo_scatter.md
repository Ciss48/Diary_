# Phase 05b: Bố cục ảnh scatter + caption/giờ + nút Copy

## Context Recap
Phase 01–05 đã xong (xem `memory/phase_05_report.md`). Ảnh đã upload/nén/xóa
được nhưng đang hiển thị dưới dạng dải thumbnail nhỏ, không xem được nội dung —
trái với mục đích "mở nhật ký ra là thấy luôn khoảnh khắc trong ngày".

User đã thiết kế bố cục mong muốn bằng Claude Design. File tham chiếu nằm ở
`docs/design/photo_scatter_reference.jsx`. **ĐỌC FILE ĐÓ TRƯỚC KHI VIẾT UI.**
Nó là mock với dữ liệu cứng, không có Supabase — dùng làm tham chiếu về bố cục,
tỉ lệ, hiệu ứng, KHÔNG copy nguyên vào `src/`.

**Không có MCP tới Supabase.** Mọi SQL đưa user chạy tay rồi chờ kết quả.

## Goal
Ảnh hiển thị to, đặt ở hai lề trang nhật ký với độ nghiêng nhẹ như ảnh polaroid
rải trên bàn. Mỗi ảnh có caption và giờ do user tự nhập. Bản sửa AI có nút Copy.

## Non-goals
- KHÔNG có nút "Use this version" hay "Keep mine". Chỉ **Copy**. Ghi bản sửa đè
  lên `entries.content` là vi phạm luật nền tảng trong CLAUDE.md.
- KHÔNG đổi logic upload/nén/xóa đã chạy tốt ở Phase 5 — chỉ đổi cách hiển thị.
- KHÔNG tăng giới hạn 4 ảnh, KHÔNG cho sắp xếp lại thứ tự, KHÔNG crop/filter.
- KHÔNG dùng `Math.random()` cho góc nghiêng (xem contract).
- KHÔNG cài package mới (không framer-motion, không thư viện animation).
- KHÔNG đụng `src/lib/suggestions.ts`, `MoodPicker.tsx`, `HeatmapGrid.tsx`,
  `MonthCalendar.tsx`, `StatsBar.tsx`, `src/app/page.tsx`.
- KHÔNG đổi chiều cao cố định hai pane, `min-h-0`, hay autosave.

## Interface Contract

### Migration `supabase/migrations/0006_photo_caption.sql`
```sql
alter table public.entry_photos
  add column if not exists caption text,
  add column if not exists taken_at time;

alter table public.entry_photos
  drop constraint if exists entry_photos_caption_len;
alter table public.entry_photos
  add constraint entry_photos_caption_len
  check (caption is null or char_length(caption) <= 80);

-- Phase 5 cố ý KHÔNG tạo policy UPDATE vì coi bản ghi ảnh là bất biến.
-- Caption và giờ là dữ liệu user sửa được sau khi upload, nên mở lại có chủ ý.
-- Vẫn giới hạn trong dữ liệu của chính user ở cả USING lẫn WITH CHECK.
create policy "entry_photos_update_own" on public.entry_photos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
Viết xong → **DỪNG**, đưa user chạy, chờ xác nhận.

### `src/lib/photos.ts` — thêm pure functions

```ts
/** Góc nghiêng của ảnh, đơn vị độ.
 *  BẮT BUỘC tất định: cùng một photoId luôn cho cùng một góc, ở mọi lần render
 *  và mọi lần tải trang. KHÔNG dùng Math.random() — ảnh sẽ nhảy góc mỗi lần
 *  React re-render (gõ một chữ trong textarea là toàn bộ ảnh giật).
 *  Cách làm: hash chuỗi id (ví dụ djb2 hoặc cộng dồn charCodeAt) rồi map vào
 *  khoảng [-5, 5], làm tròn 1 chữ số thập phân. Không trả về đúng 0. */
export function photoAngle(photoId: string): number;

/** Vị trí ảnh trong bố cục hai lề.
 *  index 0 → { side:'left',  row:0 }
 *  index 1 → { side:'right', row:0 }
 *  index 2 → { side:'left',  row:1 }
 *  index 3 → { side:'right', row:1 }
 *  Công thức tổng quát: side = index % 2 === 0 ? 'left' : 'right';
 *                       row  = Math.floor(index / 2). */
export type PhotoSlot = { side: 'left' | 'right'; row: number };
export function photoSlot(index: number): PhotoSlot;

/** Suy ra giờ chụp gợi ý từ File.lastModified.
 *  - Quy đổi mốc thời gian sang timezone `tz`.
 *  - Nếu ngày quy đổi được KHÁC `entryDate` → trả về null (file cũ, hoặc user
 *    up ảnh cho ngày khác; đoán bừa sẽ ra giờ vô nghĩa).
 *  - Khớp ngày → trả về 'HH:MM' (24 giờ, có số 0 đứng đầu).
 *  Dùng Intl.DateTimeFormat, KHÔNG dùng getHours() của local machine. */
export function deriveTakenAt(
  lastModified: number, entryDate: string, tz: string
): string | null;
```

### `scripts/test_photos.mjs` — bổ sung fixture (giữ nguyên fixture cũ)

`photoAngle`:
- Gọi 2 lần với cùng id → hai kết quả BẰNG NHAU (tính tất định).
- Với 10 id khác nhau: mọi kết quả nằm trong [-5, 5], và có ít nhất 4 giá trị
  phân biệt (chứng minh hash phân tán, không dồn về một góc).
- Không kết quả nào bằng đúng 0.

`photoSlot`: 4 assert đúng bảng ánh xạ ở trên.

`deriveTakenAt` (tz `Asia/Ho_Chi_Minh`, UTC+7 cố định quanh năm):
| lastModified | entryDate | Kỳ vọng |
|---|---|---|
| `Date.UTC(2026,6,29,3,15)` | `2026-07-29` | `'10:15'` |
| `Date.UTC(2026,6,29,3,15)` | `2026-07-28` | `null` |
| `Date.UTC(2026,6,28,18,30)` | `2026-07-29` | `'01:30'` (đã sang ngày 29 giờ VN) |
| `Date.UTC(2026,6,29,0,5)` | `2026-07-29` | `'07:05'` (có số 0 đứng đầu) |

### `src/lib/photos.ts` — sửa hàm sẵn có
- `PhotoRow` thêm `caption: string | null` và `taken_at: string | null`.
- `fetchPhotos` select thêm 2 cột đó.
- `uploadPhoto` nhận thêm tham số `timezone: string`; khi INSERT thì set
  `taken_at = deriveTakenAt(file.lastModified, entryDate, timezone)`,
  `caption = null`.
- Hàm mới:
```ts
/** UPDATE caption và/hoặc giờ. Cắt caption còn 80 ký tự trước khi gửi.
 *  Chuỗi rỗng sau khi trim → lưu null (không lưu chuỗi rỗng). */
export async function updatePhotoMeta(
  photoId: string,
  meta: { caption?: string | null; takenAt?: string | null }
): Promise<void>;
```

### `src/components/PhotoStrip.tsx` — viết lại phần hiển thị

**Bố cục desktop (`xl` trở lên):** dùng CSS grid 3 cột bọc toàn bộ vùng editor —
`[lề trái | nội dung chính | lề phải]`, ví dụ `xl:grid-cols-[1fr_minmax(0,64rem)_1fr]`.
Ảnh render vào hai cột lề theo `photoSlot`. **KHÔNG dùng `position: absolute`
để nhét ảnh vào lề** — ở các bề rộng trung gian nó sẽ đè lên nội dung, đúng loại
lỗi đã phải sửa ở Phase 4.

Mỗi ảnh là một "thẻ polaroid":
- Nền trắng, padding đều, bóng đổ nhẹ, bo góc nhỏ.
- `transform: rotate(<photoAngle(id)>deg)`; hover thì `rotate(0deg)` + nhích lên
  nhẹ + bóng đậm hơn, `transition` khoảng 200ms.
- Ảnh bên trong `aspect-[4/5] object-cover`.
- Dưới ảnh: caption (chữ nghiêng, xám) bên trái, `taken_at` bên phải. Ô nào
  null thì để trống, KHÔNG hiện placeholder.
- Slot trống: khung viền đứt cùng kích thước, icon ảnh, chữ `Add a photo` và
  `or browse files`. Cả thẻ là vùng thả file (drag & drop) và bấm được để mở
  hộp chọn file. Dùng lại đúng đường đi validate → nén → upload của Phase 5,
  không viết luồng mới.

**Bố cục mobile và tablet (dưới `xl`):** dải ngang cuộn được
(`flex overflow-x-auto snap-x`), mỗi thẻ rộng khoảng 60–70% bề ngang màn hình,
vẫn giữ độ nghiêng và caption. Thêm thẻ "+" ở cuối dải khi chưa đủ 4 ảnh.
Cuộn ngang mượt, không cắt bóng đổ (nhớ padding cho container).

**Lightbox** (đã có từ Phase 5, nay bổ sung sửa metadata):
- Ảnh lớn giữ nguyên như cũ.
- Bên dưới ảnh: ô nhập caption (`maxLength={80}`, placeholder
  `Add a caption…`) và ô nhập giờ (`<input type="time">`).
- Lưu khi blur hoặc Enter, gọi `updatePhotoMeta`; hiện trạng thái ngắn
  `Saved`. Đóng lightbox thì danh sách phải phản ánh giá trị mới.
- Vẫn đóng được bằng click nền, nút ×, và phím Escape.

**Header trang:** khi có ảnh, dòng dưới tiêu đề ngày hiện `N photos · M words`
thay cho chỉ số từ đơn lẻ. Không ảnh thì giữ nguyên như hiện tại.

### `src/components/ImprovedVersionPane.tsx` — thêm nút Copy
- Thanh chân pane: một nút **Copy** duy nhất.
- Bấm → `navigator.clipboard.writeText(suggestion.corrected_version)` →
  đổi nhãn thành `Copied` trong 2 giây rồi trở lại.
- `navigator.clipboard` không khả dụng (http, trình duyệt cũ) → hiện
  `Copy failed — select the text manually.`, không ném lỗi ra ngoài.
- **TUYỆT ĐỐI KHÔNG** thêm nút nào ghi vào `entries.content`.

### `src/components/DiaryEditor.tsx` — sửa tối thiểu
- Truyền `timezone` xuống `PhotoStrip`.
- Bọc vùng editor bằng grid 3 cột ở `xl`, đặt `PhotoStrip` đúng vị trí để nó
  render được vào hai lề. Giữ nguyên toàn bộ state suggestion, autosave, chiều
  cao pane, `min-h-0`, MoodPicker.

## Steps
1. Đọc `docs/design/photo_scatter_reference.jsx`. Nếu file không tồn tại →
   DỪNG, hỏi user.
2. Viết migration `0006_photo_caption.sql` → DỪNG, user chạy, chờ xác nhận.
3. Thêm pure functions + fixture vào `scripts/test_photos.mjs`, chạy tới khi pass.
4. Chạy lại 4 test script còn lại — phải pass nguyên trạng.
5. Sửa `src/lib/photos.ts` (types, fetch, upload, updatePhotoMeta).
6. Viết lại phần hiển thị của `PhotoStrip.tsx`.
7. Thêm nút Copy vào `ImprovedVersionPane.tsx`.
8. Sửa `DiaryEditor.tsx` (grid 3 cột + truyền timezone).
9. `npm run build` sạch.
10. Chạy DoD; phần cần browser/DB thì hướng dẫn user và chờ xác nhận.
11. Handoff Obligations.

## Definition of Done
- [ ] 5 test script pass 100%, gồm fixture mới cho `photoAngle`, `photoSlot`,
      `deriveTakenAt`.
- [ ] `npm run build` sạch.
- [ ] Màn hình rộng (≥1280px), 4 ảnh: 2 ảnh bên trái, 2 bên phải, nghiêng nhẹ
      khác nhau, đủ to để nhìn rõ nội dung. Hover → thẳng lại và nổi lên.
- [ ] **Gõ chữ trong textarea → ảnh KHÔNG đổi góc nghiêng.** Refresh trang →
      góc nghiêng của từng ảnh vẫn y như trước (tính tất định).
- [ ] Thu hẹp cửa sổ xuống dưới 1280px → chuyển sang dải ngang cuộn được, ảnh
      vẫn to và nghiêng. Không có ảnh nào đè lên chữ ở bất kỳ bề rộng nào
      (thử kéo cửa sổ từ 1600px xuống 360px, quan sát liên tục).
- [ ] Kéo thả một file ảnh vào slot trống → upload chạy như bấm chọn file.
      Kéo thả file `.pdf` → báo lỗi thân thiện, không upload.
- [ ] Upload ảnh chụp trong ngày → giờ được điền sẵn khớp giờ chụp. Upload lại
      chính file đó vào một ngày quá khứ → ô giờ để trống, không hiện giờ bịa.
- [ ] Mở lightbox, nhập caption và giờ, đóng lại → thẻ ảnh hiện đúng. Refresh
      → vẫn còn. User chạy
      `select caption, taken_at from public.entry_photos order by created_at;`
- [ ] Nhập caption dài hơn 80 ký tự → bị chặn ở ô nhập. Nhập caption toàn dấu
      cách → lưu thành `null`, không phải chuỗi rỗng.
- [ ] Nút **Copy** ở pane bản sửa: bấm → dán ra chỗ khác đúng nội dung bản sửa,
      nhãn đổi thành `Copied` rồi trở lại.
- [ ] Sau khi bấm Copy, user chạy
      `select content from public.entries where entry_date = '<ngày>';`
      → **vẫn là chữ user tự viết**, không phải bản sửa. Không tồn tại nút nào
      khác có thể ghi đè.
- [ ] Bố cục hai cột của bản sửa AI vẫn nguyên: hai pane cùng chiều cao cố
      định, cuộn riêng, không tràn ra ngoài.
- [ ] Xóa ảnh vẫn hoạt động; slot trở lại trạng thái trống có viền đứt.
- [ ] User dọn dữ liệu test.

## Handoff Obligations
1. Viết `memory/phase_05b_report.md`, liệt kê **từng mục** DoD kèm trạng thái
   thật. Không tick mục chưa thực sự kiểm tra.
2. Ghi đè `memory/STATE.md` (schema: `entry_photos` nay có `caption`,
   `taken_at`, và CÓ policy UPDATE — ghi rõ đây là thay đổi có chủ ý so với
   Phase 5).
3. Discovery Moderate/Major → `memory/discoveries.md`.
4. "Input for the next phase": Phase 6 là Polish + Deploy. Ghi lại danh sách
   biến môi trường cần khai báo trên Vercel, và những chỗ UI còn thô.
