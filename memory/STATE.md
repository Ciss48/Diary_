# State

**Last updated:** 2026-08-18 — Hotfix: sửa lỗi "Failed — tap to retry" ở
vocabulary / nút "Vn" (nguyên nhân: budget token quá lớn làm cạn trần TPM)

## Where things stand

Phases 1-17 đã xong. Không có phase nào đang chạy.

**Đang chờ user:** chạy `vercel --prod` để deploy. Lần này gói deploy gồm CẢ hai
hotfix chưa lên production:
- `src/lib/ai/provider.ts` (fix reasoning budget — hotfix trước, vẫn chưa deploy)
- fix TPM/rate-limit + cache của vocabulary & Vn (hotfix hôm nay)

Env `AI_MODEL` trên Vercel đã đổi xong lúc 14:12 (Production + Preview).
Deploy bị chặn bởi permission classifier nên session không tự chạy được.

## Completed

- [x] Phase 1: Next.js scaffold + Supabase auth + route protection — verified 2026-07-28
- [x] Phase 2: entries table + /diary/[date] editor + autosave — verified 2026-07-28
- [x] Phase 3: Calendar heatmap + streak stats — verified 2026-07-28
- [x] Phase 03b: Month calendar + mood picker — verified 2026-07-29
- [x] Phase 04: AI Suggest (bản sửa + highlight + change list + feedback) — verified 2026-07-29
- [x] Phases 5-7 + 9: Photos, fixes, heatmap year/month views — committed
- [x] Phases 10-11: Ink & Almanac visual redesign (home + entry pages) — committed
- [x] Phase 12: Two-stage AI suggest + red marks on original — committed
- [x] Phase 13: In-entry vocabulary saving — verified 2026-08-06
- [x] Phase 14: Vocabulary library page (/vocabulary) — verified 2026-08-06
- [x] Phases 15-17: Prompt tuning, Vietnamese popover, Vietnamese on vocab cards — committed `e4d22e3`
- [x] Hotfix 2026-08-18c: vocabulary/Vn hay "Failed — tap to retry" — fixed ở local, chưa deploy

## Most important findings so far

- **2026-08-18c — Groq trừ TPM theo `max_completion_tokens` ĐẶT TRƯỚC, không
  phải token thực dùng.** Một lần bấm "Vn" (thực tế chỉ tốn 44–150 token) từng
  đăng ký 5.000 → chiếm 5.157/8.000 TPM → lần bấm thứ 2 trong cùng phút luôn 429.
  Đã tách budget: `callAISmall` dùng `AI_MAX_TOKENS_SMALL` (default 700).
  Đo lại: 14 lần bấm liên tiếp 14/14 OK. **Đừng nâng con số này lên "cho chắc".**
- **2026-08-18c — cache nghĩa tiếng Việt trước đây KHÔNG BAO GIỜ ghi được.**
  Bước 8a dùng UPDATE trên `vocab_definitions`, nhưng từ chưa qua
  `/api/vocab/lookup` thì không có row để update → khớp 0 row, im lặng. Đã đổi
  sang upsert. Kéo theo: `/api/vocab/lookup` phải lọc `.neq('definition','')`
  khi đọc cache vì row do Vn tạo ra chưa có definition.
- **2026-08-18 — Groq gỡ `llama-3.3-70b-versatile`.** Đã đổi sang `openai/gpt-oss-120b`.
- **2026-08-18 — `gpt-oss-120b` là reasoning model.** Cần `reasoning_effort: 'low'`
  + `max_completion_tokens`, nếu không trả `content` RỖNG.
- **Trần Groq (on_demand): 8.000 TPM** cho mọi model chat. Lời gọi "Fix my English"
  (budget 5.000) vẫn chiếm phần lớn một phút — hai lần bấm liên tiếp vẫn có thể 429.
  Muốn hết hẳn phải nâng gói Groq.
- `AI_MAX_TOKENS` KHÔNG được đặt quá cao: input + budget vượt trần TPM → HTTP 413.
- `groq/compound` route ngầm về `gpt-oss-120b` nên dính đúng trần 8.000 TPM.
- Groq models còn dùng được: `openai/gpt-oss-120b` (đang dùng),
  `openai/gpt-oss-20b`, `qwen/qwen3.6-27b`, `groq/compound`, `groq/compound-mini`.
  (20b trả content rỗng với prompt dài stage 1; qwen rò `<think>` — đừng dùng.)
- Supabase project `yxcfgmwvcogsuoxdwycy` là **fresh project** — không dùng chung.
- Migrations đã apply: `0001_profiles`, `0002_entries`, `0003_entry_mood`,
  `0004_ai_suggestions`, `0005_ai_suggestions_stage`, `0005_entry_photos`,
  `0005_vocabulary`, `0006_photo_caption`, `0007_vietnamese`.
  **Hotfix hôm nay KHÔNG cần migration mới.**
- `createServiceClient()` trong `src/lib/supabase/server.ts` để ghi `vocab_definitions`.
- Next.js 16 (không phải 15) — `middleware.ts` vẫn hoạt động (Edge runtime).
- `createClient()` trong `src/lib/supabase/server.ts` là async (`await` required).
- Env AI tùy chọn: `AI_REASONING_EFFORT` (default `low`), `AI_MAX_TOKENS`
  (default 5000), `AI_MAX_TOKENS_SMALL` (default 700 — MỚI). Chưa set trên
  Vercel — dùng default là đúng.
- `AI_MODEL_SMALL` chưa set → `callAISmall` fallback về `AI_MODEL`.
- `SuggestionPanel.tsx` vẫn nuốt message lỗi thật của server (chỉ hiện
  "Something went wrong on our side"). `VocabPopover.tsx` thì ĐÃ sửa — nay hiện
  message thật + phân biệt rate-limit.

## Schema hiện tại

- `public.profiles` — id, display_name, avatar_url, timezone, created_at
- `public.entries` — id, user_id, entry_date, content, word_count, is_backfill, mood, created_at, updated_at; UNIQUE(user_id, entry_date)
- `public.ai_suggestions` — id, user_id, entry_id, usage_date, source_content, corrected_version, changes (jsonb), overall_feedback, model, stage, parent_id, created_at; RLS select/insert/delete own; NO UPDATE
- `public.saved_vocab` — id, user_id, entry_id, display_form, original_form, headword, change_type, status (learning/known), definition_id, created_at; RLS select/insert/update/delete own
- `public.vocab_definitions` — id, headword, part_of_speech, ipa, definition, example, source, vi_meaning, vi_source, fetched_at; UNIQUE(headword); RLS SELECT for all, no INSERT (service role).
  **Lưu ý:** row có thể tồn tại với `definition=''` (do endpoint Vn tạo để cache `vi_meaning`).
- `public.vi_explanations` — id, norm_corrected, norm_original, explanation, created_at; UNIQUE(norm_corrected, norm_original); RLS SELECT authenticated, writes via service role

## Git status

- Branch: `main`
- Latest commit: `e4d22e3` — Phases 15-17
- **Chưa commit:** `src/lib/ai/provider.ts`, `src/app/api/vocab/lookup/route.ts`,
  `src/app/api/vocab/vietnamese/route.ts`, `src/components/VocabPopover.tsx`,
  memory files. `.env.local` gitignored. User chưa yêu cầu commit.
- 354 tests pass, `npx tsc --noEmit` sạch, `npm run build` sạch.

## Next action

1. User test lại ở local (`npm run dev`): bấm nhiều từ liên tiếp + nút "Vn".
2. Chạy `vercel --prod` để deploy cả hai hotfix.
3. Nếu muốn: commit (session chưa commit vì user chưa yêu cầu).
4. Cân nhắc: `SuggestionPanel.tsx` vẫn nuốt message lỗi thật — sửa giống
   `VocabPopover.tsx` thì sự cố sau này tự lộ nguyên nhân.
5. Sau đó: chờ user quyết định phase tiếp theo.
