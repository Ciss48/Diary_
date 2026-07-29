# Discoveries Log

Ghi các phát hiện Moderate/Major theo protocol trong CLAUDE.md. Phát hiện Major
cần user mang file này quay lại phiên planning (Claude kiến trúc sư) để cập
nhật `docs/plan.md` trước khi tiếp tục.

Format mỗi entry:

---

## [Phase <N>] <tiêu đề ngắn> — Tier: <Moderate/Major>

**Finding:** Mô tả cụ thể điều khác với giả định của plan.

**Impact:** Ảnh hưởng phase nào, như thế nào.

**How it was handled (nếu Moderate):** Hướng đã chọn + lý do.

**Proposal (nếu Major):** Đề xuất cụ thể cho planning model — KHÔNG tự triển khai.

**Status:** unresolved / plan.md updated ngày ...

---

## [Phase 1] create-next-app cài Next.js 16, không phải 15 — Tier: Moderate

**Finding:** `npx create-next-app@latest` cài Next.js 16.2.12 thay vì 15 như ghi
trong plan.md. Next.js 16 thêm `proxy.ts` (Node.js runtime) song song với
`middleware.ts` (Edge runtime). Turbopack config chuyển lên top-level
(không còn `experimental.turbopack`).

**Impact:** Ảnh hưởng cách đặt tên file middleware và config Turbopack. Không
ảnh hưởng kiến trúc hoặc contract của các phase sau.

**How it was handled:** Giữ `middleware.ts` (vẫn được Next.js 16 hỗ trợ, chạy
Edge runtime, phù hợp với @supabase/ssr). Cấu hình `turbopack.root` đúng theo
Next.js 16. Build và dev đều chạy sạch.

**Status:** resolved — không cần update plan.md

---

## [Phase 1] Supabase project dùng chung với "discipline tracker" — Tier: Moderate

**Finding:** Supabase project đã có sẵn schema từ app "discipline tracker" khác:
bảng `profiles` tồn tại nhưng thiếu cột `avatar_url`, có thêm `week_start`;
bảng `goals` và `check_ins` cũng có. Trigger `on_auth_user_created` đã tồn tại
nhưng chỉ insert `id` + `display_name`, không set `avatar_url`.

**Impact:** Không thể chạy migration gốc (`CREATE TABLE public.profiles` sẽ fail
vì đã tồn tại). RLS policy "own profile" ALL đã bao phủ đủ.

**How it was handled:** Áp dụng migration thay thế:
- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text`
- `CREATE OR REPLACE FUNCTION handle_new_user()` — cập nhật để set cả
  `avatar_url`, dùng `ON CONFLICT (id) DO NOTHING` để an toàn với data cũ.
Không chạm đến bảng `goals`/`check_ins` của discipline tracker.

**Status:** resolved — phase 2 trở đi cần tránh đặt tên bảng trùng với
discipline tracker (goals, check_ins)

---

## [Phase 2] Entry Phase 1 "dùng chung discipline tracker" là SAI — đính chính

**Finding:** Entry Phase 1 bên trên (về "discipline tracker") là **factually wrong**.
MCP Phase 1 đã trỏ nhầm sang một project khác. Supabase project thực của Diary
(`yxcfgmwvcogsuoxdwycy`) là project fresh, không có bảng nào trước Phase 2.

**How it was handled:** Phase 2 apply lại migration gốc từ đầu vào đúng project.

**Status:** resolved — entry Phase 1 cũ không xóa (theo protocol), entry này thay thế nó.

---

## [Phase 4] test_dates.mjs flaky timezone test — Tier: Minor

**Finding:** `test_dates.mjs` has one test that fails once per day: "Kiritimati và Niue cách nhau ≤ 1 ngày lịch". The gap between Pacific/Kiritimati (UTC+14) and Pacific/Niue (UTC-11) is 25 hours, so between UTC 10:00–11:00 the two zones are 2 calendar days apart. The test asserts ≤ 1 day, which is wrong for that window.

**Impact:** Phase 03b ran outside this window (21/21), Phase 04 ran inside it (20/21). The test does not test any code we wrote.

**How it was handled:** Noted as pre-existing. No code was changed. If desired, the test can be fixed by asserting `diffDays <= 2` or removing that assertion.

**Status:** resolved (documentation only) — not caused by Phase 4.

---

## [Phase 3] Entry Phase 2 test entry còn sót lại trong DB — Tier: Minor

**Finding:** Khi bắt đầu Phase 3, DB còn entry `2026-07-28` (on-time, 1 word) từ
Phase 2 testing. Entry này chưa được dọn sau khi verify Phase 2.

**Impact:** Nếu chạy seed thẳng, expected values trong DoD (entries=6, words=60,
current=2) sẽ không khớp (thành entries=7, words=61, current=3).

**How it was handled:** Hướng dẫn user chạy Option A — xóa entry sót trước khi
seed. Verification cho ra kết quả đúng theo DoD.

**Status:** resolved — entry đã được xóa khi cleanup seed. DB hiện trống.

---
