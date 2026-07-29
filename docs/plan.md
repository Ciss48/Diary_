# Cập nhật `docs/plan.md`

---

## 1. Mục **2. High-level architecture** — thay dòng về ảnh bằng:

```
- **Ảnh:** tối đa 4 ảnh/entry, nén phía client bằng Canvas API (cạnh dài tối đa
  1600px, JPEG quality 0.82) — KHÔNG dùng thư viện nén ngoài. Bucket private
  `diary-photos`, truy cập qua signed URL hạn 1 giờ vì nhật ký là dữ liệu nhạy
  cảm. Đường dẫn `{userId}/{entryDate}/{uuid}.jpg`; segment đầu tiên phải là
  user id vì RLS policy trên `storage.objects` kiểm tra
  `(storage.foldername(name))[1] = auth.uid()::text`.
- **Thứ tự xóa ảnh: storage trước, DB row sau.** Dung lượng storage (free tier
  1GB) là tài nguyên khan hiếm; row trỏ tới file đã mất chỉ hiện thumbnail hỏng
  và xóa lại được, còn file mồ côi thì vô hình và ăn quota vĩnh viễn.
- **Dùng `<img>` thường cho ảnh, không dùng `next/image`** — signed URL có
  domain động và hết hạn, cấu hình remotePatterns cho nó không đáng công.
```

---

## 2. Mục **3. Phase list** — sửa thành:

```
### Phase 4: AI Suggest — [XONG ✓ 2026-07-29]
Kèm 3 lần chỉnh UI sau đó: chuyển sang bố cục hai cột dùng chính textarea làm
cột trái, cố định chiều cao hai pane + thanh cuộn riêng, sửa lỗi tràn min-h-0.

### Phase 5: Ảnh kỷ niệm — [CÓ TASK FILE CHI TIẾT]
Bảng `entry_photos`, bucket private `diary-photos`, nén client-side bằng Canvas,
dải thumbnail chèn giữa nút suggest và SuggestionDetails, lightbox, xóa ảnh,
signed URL.

### Phase 6: Polish + Deploy — [SKETCH]
Bám `docs/design/` hoàn thiện UI (gồm chuyển danh sách thay đổi thành popover
nổi), responsive mobile, loading/error/empty states, deploy Vercel (khai báo
env, đổi Site URL + Redirect URLs của Supabase sang domain production).
```

---

## 3. Mục **4. Risks / assumptions** — thêm:

```
- **Supabase Storage free tier 1GB.** Sau khi nén, một ảnh thường còn khoảng
  200–400KB. Với 4 ảnh/ngày thì một user viết đều đặn tiêu ~1.5MB/ngày, tức
  ~550MB/năm — một mình bạn thì hết năm đầu mới chạm nửa quota, nhưng chỉ cần
  vài user đều đặn là đầy trong vài tháng. Phase 5 report phải ghi lại tỉ lệ
  nén thực tế quan sát được để ước lượng lại con số này.
- **Nợ kiểm thử từ Phase 4:** mục DoD về RLS chéo user được đánh dấu "not
  verified" và chỉ suy luận từ nội dung policy. Phase 5 phải thực sự kiểm tra
  bằng tài khoản thứ hai, cho cả ảnh lẫn suggestion.
```

---

## 4. Mục **5. Plan change log** — thêm:

| Date | Change | Reason | Source |
|------|--------|--------|--------|
| 2026-07-29 | Khóa chi tiết kỹ thuật phần ảnh: nén Canvas, thứ tự xóa, quy ước path | Cần chốt trước khi viết task Phase 5 | Phiên planning |
| 2026-07-29 | Ghi nhận nợ kiểm thử RLS chéo user từ Phase 4 | Report Phase 4 đánh dấu "not verified" | phase_04_report.md |
