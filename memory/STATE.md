# State

**Last updated:** 2026-08-06 — Phases 13-14 hoàn thành, committed + pushed to `vocabulary` branch

## Where things stand

Current phase: 14 — Vocabulary Library. Status: **DONE ✓**

## Completed

- [x] Phase 1: Next.js scaffold + Supabase auth + route protection — verified 2026-07-28
- [x] Phase 2: entries table + /diary/[date] editor + autosave — verified 2026-07-28
- [x] Phase 3: Calendar heatmap + streak stats — verified 2026-07-28
- [x] Phase 03b: Month calendar + mood picker — verified 2026-07-29
- [x] Phase 04: AI Suggest (bản sửa + highlight + change list + feedback) — verified 2026-07-29
- [x] Phases 5-7 + 9: Photos, fixes, heatmap year/month views — committed
- [x] Phases 10-11: Ink & Almanac visual redesign (home + entry pages) — committed
- [x] Phase 12: Two-stage AI suggest + red marks on original — committed
- [x] Phase 13: In-entry vocabulary saving (popover, panel, lookup, save/remove) — verified 2026-08-06
- [x] Phase 14: Vocabulary library page (/vocabulary) with stats, search, sort, filter — verified 2026-08-06

## Most important findings so far

- Supabase project `yxcfgmwvcogsuoxdwycy` là **fresh project** — không dùng chung với app nào.
- Migrations applied: `profiles` + `entries` + `0003_entry_mood` + `0004_ai_suggestions` + `0005_vocabulary`.
- `saved_vocab` (user_id, entry_id, headword, change_type, status). `vocab_definitions` (headword, pos, ipa, definition — shared, service-role write).
- Index `idx_saved_vocab_user_created` on (user_id, created_at DESC).
- `createServiceClient()` added in `src/lib/supabase/server.ts` for writing to `vocab_definitions`.
- AI prompt now returns `headword`, `pos`, `worth_saving` per change.
- Next.js 16 (không phải 15) — `middleware.ts` vẫn hoạt động (Edge runtime).
- `createClient()` trong `src/lib/supabase/server.ts` là async (`await` required).
- AI provider: Groq, model từ `AI_MODEL` env, rate limit từ `AI_DAILY_LIMIT` env (default 5).

## Schema hiện tại

- `public.profiles` — id, display_name, avatar_url, timezone, created_at
- `public.entries` — id, user_id, entry_date, content, word_count, is_backfill, mood, created_at, updated_at; UNIQUE(user_id, entry_date)
- `public.ai_suggestions` — id, user_id, entry_id, usage_date, source_content, corrected_version, changes (jsonb), overall_feedback, model, created_at; RLS select/insert/delete own; NO UPDATE
- `public.saved_vocab` — id, user_id, entry_id, display_form, original_form, headword, change_type, status (learning/known), created_at; RLS select/insert/update/delete own
- `public.vocab_definitions` — id, headword, part_of_speech, ipa, definition, example, source, created_at; UNIQUE(headword, part_of_speech); RLS SELECT for all, no INSERT (service role)

## Git status

- Branch: `vocabulary` (pushed to origin)
- Latest commit: `0e67001` — Phases 13-14: Vocabulary saving in entries + standalone library page
- 299 tests pass, build clean

## Next action

Chờ user quyết định phase tiếp theo hoặc merge `vocabulary` vào `main`.
