# Diary — Luồng làm việc tổng quan

Bộ tài liệu này gồm 3 nhóm, tương ứng 3 "người" bạn sẽ làm việc cùng:

```
diary-project/
├── 0_WORKFLOW.md                    ← file này
├── 1_design/
│   └── claude_design_brief.md       ← đưa cho Claude Design
├── 2_supabase/
│   └── supabase_setup_guide.md      ← bạn tự làm theo, ~20 phút
├── 3_repo/                          ← copy NGUYÊN VẸN vào repo, đưa cho Claude Code
│   ├── CLAUDE.md
│   ├── docs/plan.md
│   ├── tasks/phase_01_foundation_auth.md
│   ├── tasks/phase_02_entries_editor.md
│   └── memory/ (STATE.md, discoveries.md)
└── 4_prompts/
    └── claude_code_prompts.md       ← prompt paste vào Claude Code mỗi phase
```

## Thứ tự thực hiện

**Bước 1 — Supabase (bạn làm, ~20 phút).** Làm theo `2_supabase/supabase_setup_guide.md`.
Kết quả: có `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Google OAuth đã bật.

**Bước 2 — Claude Design (chạy song song được).** Mở Claude Design, dán nội dung
`1_design/claude_design_brief.md`. Nhận về design → lưu screenshot các màn hình
(và code/token nếu có) vào thư mục `docs/design/` trong repo. Đây là tài liệu
THAM CHIẾU cho Claude Code, không copy code design thẳng vào `src/`.

**Bước 3 — Khởi tạo repo.** Tạo thư mục project (ví dụ `diary/`), copy toàn bộ
nội dung `3_repo/` vào gốc repo. Tạo file `.env.local` theo mẫu trong task phase 1,
điền 2 giá trị Supabase từ Bước 1.

**Bước 4 — Claude Code chạy Phase 1.** Mở Claude Code tại gốc repo, paste
prompt Phase 1 trong `4_prompts/claude_code_prompts.md`. Không cần chờ Bước 2
xong — Phase 1 (auth) gần như không có UI.

**Bước 5 — Checkpoint sau mỗi phase.** Khi Claude Code báo xong một phase:
1. Bạn tự chạy các mục trong Definition of Done của task file (đều là mục tick được).
2. Gửi `memory/STATE.md` + `memory/phase_<N>_report.md` (+ `discoveries.md` nếu
   có entry mới) vào phiên chat với architect (Claude) để review.
3. Architect cập nhật `plan.md` nếu cần, viết task file + prompt cho phase kế
   tiếp, bạn copy vào repo và mở phiên Claude Code mới.

Phase 3 trở đi hiện chỉ có sketch trong plan.md — đúng nguyên tắc của skill:
không viết chi tiết cho phase xa khi chưa có thông tin thật từ phase trước.

## Nguyên tắc bất biến của luồng

- `docs/plan.md` chỉ được sửa qua vòng lặp bạn ↔ tôi. Claude Code không sửa nó.
- Task file phase N+1 chỉ được viết sau khi phase N kết thúc và có report.
- Mọi secret (Supabase key, Groq key) chỉ nằm trong `.env.local` và Vercel env —
  không bao giờ dán vào chat với Claude Code, chỉ cần nói "đã có trong .env.local".
