# Phase 05: Ảnh kỷ niệm

## Context Recap
Phase 01–04 đã xong (xem `memory/phase_04_report.md`, đọc cả 3 addendum ở
cuối). Hiện có: Next.js 16 + Supabase auth, bảng `profiles` / `entries` (có
`mood`) / `ai_suggestions`, trang chủ với heatmap + lịch tháng, trang
`/diary/[date]` với `DiaryEditor.tsx` đã tái cấu trúc thành bố cục hai cột
(textarea trái + `ImprovedVersionPane` phải + `SuggestionDetails` full-width
bên dưới). 4 test script, tổng 114 assertion.

Phase này thêm khả năng đính ảnh kỷ niệm vào mỗi ngày nhật ký.

**Không có MCP tới Supabase.** Mọi SQL đưa user chạy tay rồi chờ kết quả.

**Precondition:** bucket `diary-photos` đã được tạo (private) và đã có 3 RLS
policy trên `storage.objects` (select/insert/delete own). Nếu user chưa xác
nhận, DỪNG và yêu cầu xác nhận trước khi viết code upload.

## Goal
Trong trang viết nhật ký, user thêm được tối đa 4 ảnh cho ngày đó. Ảnh được
nén phía client trước khi upload, lưu trong bucket private, hiển thị dạng dải
thumbnail, click phóng to, xóa được.

## Non-goals
- KHÔNG cho sắp xếp lại thứ tự ảnh (sắp theo `created_at`).
- KHÔNG crop/xoay/filter/chỉnh sửa ảnh.
- KHÔNG hiện ảnh trên heatmap hay lịch tháng.
- KHÔNG có carousel prev/next trong lightbox — chỉ mở và đóng.
- KHÔNG gửi ảnh cho AI. Route `/api/suggest` không đổi một dòng nào.
- KHÔNG cài package mới. Nén bằng Canvas API sẵn có của trình duyệt, KHÔNG
  dùng browser-image-compression hay thư viện tương tự.
- KHÔNG đụng `src/lib/suggestions.ts`, `SuggestionPanel.tsx`,
  `ImprovedVersionPane.tsx`, `SuggestionDetails.tsx`, `MoodPicker.tsx`,
  `HeatmapGrid.tsx`, `MonthCalendar.tsx`, `StatsBar.tsx`, `src/app/page.tsx`.
- KHÔNG đổi logic autosave, bố cục hai cột, hay chiều cao cố định của hai pane.

## Interface Contract

### Migration `supabase/migrations/0005_entry_photos.sql`
```sql
create table public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  storage_path text not null unique,
  width integer,
  height integer,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create index entry_photos_entry_idx
  on public.entry_photos (entry_id, created_at);

alter table public.entry_photos enable row level security;

create policy "entry_photos_select_own" on public.entry_photos
  for select using (auth.uid() = user_id);
create policy "entry_photos_insert_own" on public.entry_photos
  for insert with check (auth.uid() = user_id);
create policy "entry_photos_delete_own" on public.entry_photos
  for delete using (auth.uid() = user_id);
```
Cố ý KHÔNG có policy UPDATE — bản ghi ảnh là bất biến (giống `ai_suggestions`).

Viết xong → **DỪNG**, đưa user chạy, chờ xác nhận.

### `src/lib/photos.ts` — phần pure functions (test được)

```ts
export const MAX_PHOTOS_PER_ENTRY = 4;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;   // trước khi nén
export const MAX_STORED_BYTES = 5 * 1024 * 1024;    // sau khi nén, khớp limit bucket
export const MAX_EDGE = 1600;                        // cạnh dài nhất sau khi nén
export const JPEG_QUALITY = 0.82;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Tính kích thước đích, giữ nguyên tỉ lệ.
 *  - KHÔNG BAO GIỜ phóng to: cạnh dài <= maxEdge thì trả về nguyên kích thước.
 *  - Kết quả luôn là số nguyên >= 1 (làm tròn Math.round, rồi kẹp sàn 1). */
export function computeTargetSize(
  width: number, height: number, maxEdge: number
): { width: number; height: number };

/** Kiểm tra file trước khi nén. Trả về null nếu hợp lệ, hoặc chuỗi lỗi
 *  thân thiện để hiện thẳng cho user. */
export function validatePhotoFile(
  file: { type: string; size: number }
): string | null;
// - type không thuộc ALLOWED_TYPES → 'Only JPEG, PNG and WebP images are supported.'
// - size > MAX_UPLOAD_BYTES → 'That image is too large (max 15 MB).'
// - size === 0 → 'That file appears to be empty.'

/** Sinh đường dẫn lưu trữ. PHẢI đúng quy ước 3 cấp
 *  `{userId}/{entryDate}/{uuid}.{ext}` vì RLS policy trên storage.objects
 *  kiểm tra (storage.foldername(name))[1] === auth.uid()::text.
 *  ext luôn là 'jpg' vì mọi ảnh đều được nén sang JPEG. */
export function buildStoragePath(
  userId: string, entryDate: string, uuid: string
): string;
```

### `src/lib/photos.ts` — phần browser-only (không test bằng node)
```ts
export type PhotoRow = {
  id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
  created_at: string;
};

/** Nén bằng Canvas:
 *  1. createImageBitmap(file) để lấy kích thước thật.
 *  2. computeTargetSize → vẽ lên <canvas> (hoặc OffscreenCanvas nếu có).
 *  3. canvas.toBlob('image/jpeg', JPEG_QUALITY).
 *  4. Nếu blob lớn hơn file gốc (ảnh nhỏ, đã nén tốt) → dùng file gốc,
 *     nhưng vẫn trả về width/height thật.
 *  5. Giải phóng bitmap bằng bitmap.close().
 *  Ném Error với thông điệp thân thiện nếu decode thất bại (file hỏng). */
export async function compressImage(
  file: File
): Promise<{ blob: Blob; width: number; height: number }>;

/** Lấy danh sách ảnh của entry, đã sắp xếp theo created_at tăng dần. */
export async function fetchPhotos(entryId: string): Promise<PhotoRow[]>;

/** Tạo signed URL hàng loạt (hết hạn 3600s). Trả về map path → url.
 *  Dùng storage.from('diary-photos').createSignedUrls(paths, 3600). */
export async function signPhotoUrls(paths: string[]): Promise<Record<string, string>>;

/** Nén → upload lên storage → INSERT row. Trả về row vừa tạo.
 *  Thứ tự bắt buộc: upload storage TRƯỚC, INSERT sau. Nếu INSERT lỗi thì
 *  xóa file vừa upload để không để lại rác. */
export async function uploadPhoto(
  entryId: string, entryDate: string, file: File
): Promise<PhotoRow>;

/** Xóa storage TRƯỚC, rồi xóa row.
 *  Lý do thứ tự này: dung lượng storage (free tier 1GB) là tài nguyên khan
 *  hiếm, còn một row DB trỏ tới file đã mất chỉ hiện thành thumbnail hỏng mà
 *  user bấm xóa lại được. File mồ côi thì vô hình và ăn quota vĩnh viễn. */
export async function deletePhoto(photoId: string, storagePath: string): Promise<void>;
```

### `scripts/test_photos.mjs`
Node thuần, `node:assert`, in tên từng case, exit 1 khi fail.
**Chỉ test 3 hàm pure** (`computeTargetSize`, `validatePhotoFile`,
`buildStoragePath`) — phần Canvas/Supabase không test được bằng node, và
KHÔNG được mock.

`computeTargetSize(w, h, 1600)`:
| Input | Kỳ vọng | Ý nghĩa |
|---|---|---|
| 800, 600 | 800, 600 | nhỏ hơn ngưỡng → không phóng to |
| 1600, 1200 | 1600, 1200 | đúng bằng ngưỡng |
| 3200, 2400 | 1600, 1200 | ngang là cạnh dài |
| 2400, 3200 | 1200, 1600 | dọc là cạnh dài |
| 3000, 1000 | 1600, 533 | tỉ lệ lẻ, phải làm tròn |
| 1, 1 | 1, 1 | ảnh cực nhỏ |
| 5000, 3 | 1600, 1 | kết quả tính ra < 1 phải kẹp lên 1, KHÔNG được là 0 |
- Thêm assert quét mọi case: cả hai giá trị đều là số nguyên và >= 1.

`validatePhotoFile`:
- `{type:'image/jpeg', size: 1000}` → null
- `{type:'image/png', size: 1000}` → null
- `{type:'image/webp', size: 1000}` → null
- `{type:'image/gif', size: 1000}` → chuỗi lỗi (không null)
- `{type:'application/pdf', size: 1000}` → chuỗi lỗi
- `{type:'image/jpeg', size: 20*1024*1024}` → chuỗi lỗi
- `{type:'image/jpeg', size: 0}` → chuỗi lỗi

`buildStoragePath('u1','2026-07-29','abc')` → `'u1/2026-07-29/abc.jpg'`
- Assert: `path.split('/').length === 3` và `path.split('/')[0] === userId`
  (đây chính là điều RLS policy dựa vào).

### `src/components/PhotoStrip.tsx` — mới, `'use client'`
```
Props: { entryDate: string }
```
- Mount: gọi `fetchEntry(entryDate)` (hàm sẵn có trong `src/lib/entries.ts`)
  để lấy entry id. Không có entry → hiện trạng thái vô hiệu hóa với dòng gợi ý
  `Write something first to add photos.` **KHÔNG được tạo entry rỗng** — cùng
  luật đã áp cho MoodPicker ở Phase 3b.
- Có entry → `fetchPhotos` + `signPhotoUrls`, hiện dải thumbnail vuông
  (`aspect-square`, `object-cover`, bo góc nhẹ), kèm ô "+" để thêm ảnh.
- Ô "+" ẩn đi khi đã đủ `MAX_PHOTOS_PER_ENTRY`; thay bằng dòng nhỏ
  `4 of 4 photos`.
- `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>` ẩn,
  kích hoạt bằng nút. Chọn nhiều file thì:
  - Cắt bớt nếu vượt quá số slot còn lại, báo `Only N more photos can be added.`
  - Xử lý TUẦN TỰ từng file (không Promise.all — tránh dồn bộ nhớ khi nén).
  - Hiện tiến trình `Uploading 2 of 3…`.
  - Một file lỗi thì báo lỗi file đó và VẪN tiếp tục các file còn lại.
- Sau khi nén, nếu blob vẫn > `MAX_STORED_BYTES` → báo lỗi, không upload.
- Thumbnail có nút xóa nhỏ (góc trên phải, hiện khi hover trên desktop, luôn
  hiện trên mobile). Bấm → `confirm()` xác nhận → `deletePhoto` → cập nhật danh sách.
- Click thumbnail → **lightbox**: overlay tối, ảnh vừa màn hình
  (`max-h-[90vh] max-w-[90vw] object-contain`), đóng bằng click nền, nút ×,
  hoặc phím Escape. Không prev/next.
- Dùng `<img>` thường, KHÔNG dùng `next/image` (signed URL có domain động và
  hết hạn — cấu hình remotePatterns cho nó là rắc rối không đáng).
- Có `width`/`height` thì đặt lên thẻ `<img>` để tránh nhảy layout.

### `src/components/DiaryEditor.tsx` — sửa (tối thiểu)
Tìm comment sẵn có:
```tsx
{/* [Phase 5: insert <PhotoStrip entryDate={date} /> here, above the changes list] */}
```
Chèn `<PhotoStrip entryDate={date} />` ngay sau nó, trước khối
`{hasSuggestionVisible && <SuggestionDetails … />}`. Render full-width ở CẢ
hai chế độ bố cục (một cột và hai cột). Xóa dòng comment đánh dấu sau khi chèn.

KHÔNG đổi gì khác trong file này — không đụng state suggestion, autosave,
chiều cao pane, hay MoodPicker.

## Steps
1. Xác nhận với user rằng bucket + 3 storage policy đã sẵn sàng. Chưa có → DỪNG.
2. Viết migration `0005_entry_photos.sql` → DỪNG, user chạy, chờ xác nhận.
3. Viết phần pure của `src/lib/photos.ts` + `scripts/test_photos.mjs`, chạy tới
   khi pass 100%.
4. Chạy lại 4 test script cũ — phải pass nguyên trạng.
5. Viết phần browser-only của `src/lib/photos.ts`.
6. Viết `PhotoStrip.tsx`, chèn vào `DiaryEditor.tsx`.
7. `npm run build` sạch.
8. Chạy DoD; phần cần browser/DB thì hướng dẫn user và chờ xác nhận.
9. Handoff Obligations.

## Definition of Done
- [ ] 5 test script (`dates`, `streaks`, `calendar`, `suggestions`, `photos`)
      pass 100%. `test_photos.mjs` phủ đủ 7 fixture `computeTargetSize` +
      assert số nguyên >= 1 + 7 fixture `validatePhotoFile` + 2 assert
      `buildStoragePath`.
- [ ] `npm run build` sạch.
- [ ] Mở ngày CHƯA có entry → PhotoStrip hiện trạng thái vô hiệu hóa. User chạy
      `select count(*) from public.entries where entry_date = '<ngày đó>';`
      → **0** (không sinh entry rỗng).
- [ ] Viết nội dung, chờ save, thêm 1 ảnh JPEG lớn (>3MB, cạnh >2000px):
      upload thành công, thumbnail hiện ra. User chạy
      `select width, height, size_bytes, storage_path from public.entry_photos
       order by created_at desc limit 1;`
      → cạnh dài <= 1600, `size_bytes` NHỎ HƠN RÕ RỆT file gốc (chứng minh nén
      thật sự chạy), `storage_path` có đúng dạng `<uuid>/<ngày>/<uuid>.jpg`.
- [ ] Thêm đủ 4 ảnh → ô "+" biến mất, hiện `4 of 4 photos`. Thử thêm nữa
      (kéo thả hoặc chọn file) → bị chặn.
- [ ] Chọn cùng lúc 3 file khi chỉ còn 2 slot → chỉ 2 file được upload, có
      thông báo rõ ràng.
- [ ] Chọn một file `.gif` hoặc `.pdf` → báo lỗi thân thiện, không upload.
- [ ] Click thumbnail → lightbox mở; đóng được bằng cả 3 cách (click nền, nút ×,
      phím Escape).
- [ ] Xóa 1 ảnh → biến mất khỏi dải. User kiểm tra **cả hai nơi**:
      `select count(*) from public.entry_photos where entry_id = '<id>';` giảm 1,
      VÀ trong Storage → bucket `diary-photos`, file tương ứng đã biến mất.
- [ ] Refresh trang → ảnh vẫn hiện (signed URL được tạo lại, không phải link chết).
- [ ] Bố cục không vỡ: PhotoStrip hiện full-width cả khi đang mở bản sửa AI
      (hai cột) lẫn khi không (một cột). Hai pane vẫn giữ chiều cao cố định,
      không tràn.
- [ ] RLS chéo user: tài khoản Google thứ hai (ẩn danh) mở cùng ngày → không
      thấy ảnh của tài khoản thứ nhất. Đây là mục Phase 4 đã bỏ sót — lần này
      phải thực sự kiểm tra, không được suy luận từ policy.
- [ ] Bucket vẫn là private: user thử mở URL công khai
      `https://<ref>.supabase.co/storage/v1/object/public/diary-photos/<path>`
      → phải bị từ chối (không xem được ảnh mà không có signed URL).
- [ ] User dọn dữ liệu test (cả row lẫn file trong bucket).

## Handoff Obligations
1. Viết `memory/phase_05_report.md`, liệt kê **từng mục** DoD kèm trạng thái
   thật. Không tick mục chưa thực sự kiểm tra.
2. Ghi đè `memory/STATE.md` (schema nay có thêm `entry_photos`; bucket
   `diary-photos` đã hoạt động).
3. Discovery Moderate/Major → `memory/discoveries.md`.
4. "Input for the next phase": Phase 6 là Polish + Deploy. Ghi lại:
   (a) danh sách các chỗ UI còn thô cần polish theo `docs/design/` nếu có;
   (b) mọi biến môi trường cần khai báo trên Vercel;
   (c) tỉ lệ nén thực tế quan sát được (kích thước trước/sau) để ước lượng
   dung lượng storage cho nhiều user.
