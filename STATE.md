# State

**Last updated:** 2026-07-12 — khởi tạo dự án (chưa có phase nào chạy)

## Where things stand
Current phase: 1 — Foundation + Auth. Status: chưa bắt đầu.

## Completed
(chưa có)

## Most important findings so far
- Supabase project đã được user tạo: Google OAuth đã bật, migration chạy tay
  qua SQL Editor (không dùng CLI).
- `.env.local` đã có `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Hai luật nghiệp vụ quan trọng nhất: ngày tính theo `profiles.timezone`
  (mặc định Asia/Ho_Chi_Minh, không dùng UTC trực tiếp) và `is_backfill` chỉ
  set một lần lúc tạo entry.

## Next action
Task file: `tasks/phase_01_foundation_auth.md`. Không có blocker.
