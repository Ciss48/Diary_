# HƯỚNG DẪN

Nối nguyên khối bên dưới vào CUỐI file `memory/discoveries.md` hiện có.
KHÔNG xóa entry cũ — entry sai vẫn giữ lại, chỉ bị đính chính.

Đồng thời, sửa dòng **Status** của entry
`## [Phase 1] Supabase project dùng chung với "discipline tracker" — Tier: Moderate`
thành:

```
**Status:** ❌ SAI — bị bác bỏ bởi entry [Phase 2] bên dưới. Không dùng thông
tin trong entry này.
```

---

(nối từ đây)

## [Phase 2] ĐÍNH CHÍNH: project KHÔNG dùng chung với discipline tracker — Tier: Major

**Finding:** Entry `[Phase 1] Supabase project dùng chung với "discipline
tracker"` là **SAI hoàn toàn**. Nguyên nhân: MCP ở Phase 1 trỏ nhầm sang project
`oodcylqxwqicdeargogz` (của app khác). Project thật của Diary là
`yxcfgmwvcogsuoxdwycy` — hoàn toàn trống, không có bảng nào từ trước.

**Impact:** Mọi kết luận rút ra từ entry Phase 1 đều vô hiệu, cụ thể:
- KHÔNG có bảng `goals` / `check_ins` nào cần tránh trùng tên.
- KHÔNG cần dùng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` hay `ON CONFLICT`
  để né schema cũ — migration gốc `CREATE TABLE` chạy bình thường.
- Migration 0001 và 0002 đã được apply lại từ đầu vào đúng project.

**How it was handled:** Sửa `~/.claude.json` trỏ đúng project, re-apply cả hai
migration. Bảng `profiles` và `entries` hiện đúng theo schema trong task file gốc.

**Status:** resolved — plan.md updated 2026-07-28 (mục 2 ghi rõ project ref).

---

## [Phase 2] Mất kênh MCP tới Supabase — Tier: Major

**Finding:** Từ sau Phase 2, Claude Code không kết nối được MCP tới Supabase.
Executor không còn cách nào tự chạy migration hay tự query xác minh dữ liệu.

**Impact:** Ảnh hưởng mọi phase còn lại (3, 4, 5, 6). Mọi Definition of Done
liên quan tới dữ liệu phải chuyển thành: executor soạn SQL → user chạy tay →
user báo kết quả. Nguy cơ chính là executor "giả định" thao tác DB đã chạy và
tiếp tục viết code dựa trên schema chưa tồn tại.

**How it was handled:** Thêm luật đầu tiên trong mục "Luật bất biến" của
CLAUDE.md: cấm mọi truy cập Supabase tự động, bắt buộc dừng chờ user. Task file
từ Phase 3 trở đi phải viết sẵn SQL kiểm tra để user copy-paste.

**Status:** resolved — CLAUDE.md + plan.md updated 2026-07-28.

---

## [Phase 2] Nợ kỹ thuật: test_dates.mjs và một số DoD chưa xác minh — Tier: Moderate

**Finding:** Task file Phase 2 yêu cầu `scripts/test_dates.mjs` và 8 mục
Definition of Done. Report Phase 2 chỉ liệt kê 4 mục đã verify; không thấy
`scripts/test_dates.mjs` trong danh sách file đã tạo. Các mục chưa được xác
minh: test script pass, `npm run build` thành công, `is_backfill` được bảo toàn
khi save lại (không tạo row thứ hai), route ngày sai trả 404, RLS chặn chéo
user, word count cập nhật realtime.

**Impact:** Phase 3 phụ thuộc trực tiếp vào `src/lib/dates.ts` (đặc biệt
`getTodayInTimezone`) và vào tính đúng đắn của `is_backfill`. Nếu hai thứ này
sai, streak sẽ sai theo mà rất khó phát hiện.

**How it was handled:** Chuyển thành "Step 0" bắt buộc của Phase 3 — kiểm tra
và bù đắp trước khi viết code mới.

**Status:** resolved — đưa vào tasks/phase_03_calendar.md.
