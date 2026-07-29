# State

**Last updated:** 2026-07-29 — Phase 04 hoàn thành, đã verify end-to-end

## Where things stand

Current phase: 04 — AI Suggest. Status: **DONE ✓**

## Completed

- [x] Phase 1: Next.js scaffold + Supabase auth + route protection — verified 2026-07-28
- [x] Phase 2: entries table + /diary/[date] editor + autosave — verified 2026-07-28
- [x] Phase 3: Calendar heatmap + streak stats — verified 2026-07-28
- [x] Phase 03b: Month calendar + mood picker — verified 2026-07-29
- [x] Phase 04: AI Suggest (bản sửa + highlight + change list + feedback) — verified 2026-07-29

## Most important findings so far

- Supabase project `yxcfgmwvcogsuoxdwycy` là **fresh project** — không dùng chung với app nào.
- Migrations applied: `profiles` + `entries` + `0003_entry_mood` + `0004_ai_suggestions`.
- Unique constraint on `entries(user_id, entry_date)`. `ai_suggestions` has no UPDATE policy — rows are immutable.
- Next.js 16 (không phải 15) — `middleware.ts` vẫn hoạt động (Edge runtime).
- `createClient()` trong `src/lib/supabase/server.ts` là async (`await` required).
- `searchParams` / `params` trong Next.js 16 page components là Promise — phải `await`.
- AI provider: Groq, gọi bằng `fetch` thuần (không SDK), model từ `AI_MODEL` env, rate limit từ `AI_DAILY_LIMIT` env (default 5).
- `usage_date` = ngày local của user khi gọi API (không phải entry_date). Failed/unparseable calls không tính quota.
- `test_dates.mjs` có 1 flaky test (UTC 10:00–11:00 window) — pre-existing, không liên quan Phase 4.

## Schema hiện tại

- `public.profiles` — id, display_name, avatar_url, timezone, created_at
- `public.entries` — id, user_id, entry_date, content, word_count, is_backfill, mood (text nullable check happy/normal/sad), created_at, updated_at; UNIQUE(user_id, entry_date)
- `public.ai_suggestions` — id, user_id, entry_id, usage_date, source_content, corrected_version, changes (jsonb), overall_feedback, model, created_at; RLS select/insert/delete own; NO UPDATE policy

## Files viết trong Phase 04

- `supabase/migrations/0004_ai_suggestions.sql` — ai_suggestions table + RLS
- `src/lib/suggestions.ts` — types + filterChanges + parseSuggestion + segmentCorrected
- `scripts/test_suggestions.mjs` — 19 assertions, all pass
- `src/lib/ai/prompt.ts` — SYSTEM_PROMPT (verbatim)
- `src/lib/ai/provider.ts` — callAI (Groq, fetch, 30s timeout, response_format retry)
- `src/app/api/suggest/route.ts` — POST: 10-step flow, rate limit, no raw provider errors to client
- `src/components/SuggestionPanel.tsx` — NEW client component
- `src/components/DiaryEditor.tsx` — +2 props, SuggestionPanel inserted below textarea
- `src/app/diary/[date]/page.tsx` — server-side loads latest suggestion + remaining count

## Next action

Bắt đầu Phase 5: Ảnh kỷ niệm.
Task file: `tasks/phase_05_photos.md` (hoặc tên tương đương).
Điểm chèn photo strip: trong `DiaryEditor.tsx`, tìm comment:
`{/* [Phase 5: insert <PhotoStrip entryDate={date} /> here, above SuggestionPanel] */}`
và thêm `<PhotoStrip entryDate={date} />` ngay sau comment đó.
