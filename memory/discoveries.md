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

## [Hotfix 2026-08-18d] `SUPABASE_SERVICE_ROLE_KEY` thiếu trên Vercel + ghi cache nằm trên đường critical — Tier: Moderate

**Triệu chứng:** sau khi deploy hotfix 18c, user vẫn báo "Failed — tap to retry".

**Finding:** `vercel env ls production` cho thấy project CHỈ có 6 biến:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `AI_PROVIDER`,
`AI_MODEL`, `AI_API_KEY`, `AI_DAILY_LIMIT`. **Không có `SUPABASE_SERVICE_ROLE_KEY`.**

`createServiceClient()` throw ngay khi thiếu key này. Trong CẢ HAI route
`/api/vocab/vietnamese` (bước 8) và `/api/vocab/lookup` (bước 8), lời gọi đó nằm
**NGOÀI** try/catch → throw thoát khỏi handler → Next trả HTTP 500 (body HTML) →
client `res.json()` fail → `data` null → rơi vào nhánh cuối cùng và hiện đúng
chuỗi literal "Failed — tap to retry".

Điểm quan trọng: **lời gọi LLM đã THÀNH CÔNG trước đó**, bản dịch đã nằm trong
tay, rồi route mới chết lúc đi ghi cache. Nên trên production tính năng này hỏng
**mọi lần** (trừ full cache hit — mà cache thì chưa bao giờ ghi được, xem 18c).
Đây là lý do 18c chưa đủ: 18c sửa nguyên nhân rate-limit thật, nhưng còn nguyên
nhân thứ hai này che phía sau.

**Vì sao trước đây "verified" mà không lộ:** Phase 13/14 verify ở local, nơi
`.env.local` CÓ `SUPABASE_SERVICE_ROLE_KEY`. Chênh lệch env local↔production
không được kiểm.

**How it was handled (Moderate — tự xử lý):**
1. Thêm `SUPABASE_SERVICE_ROLE_KEY` vào Vercel (Production + Preview) qua
   `vercel env add`, pipe thẳng từ `.env.local`, không in giá trị ra màn hình.
2. Ghi cache là **best-effort** — không bao giờ được phép giết request đang thành
   công. Bọc service client + toàn bộ cache write trong try/catch ở cả 2 route.
3. `/api/vocab/lookup`: khi không ghi được row, vẫn TRẢ definition đã fetch
   (`id: null`, `cached: false`) thay vì 500. Bước link `saved_vocab` chỉ chạy
   khi thực sự có row id.

**Bài học chung:** cache tồn tại để tiết kiệm cho request SAU. Nó không bao giờ
được nằm trên đường critical của request HIỆN TẠI. Kiểm tra `vercel env ls` mỗi
khi thêm một biến env mới vào code — local pass không nói lên gì về production.

**Verify:** `npx tsc --noEmit` sạch, `npm run build` sạch, 354/354 test pass,
kiểm tra tĩnh xác nhận `createServiceClient()` nay nằm trong try ở cả 2 file.
Deploy `6b974b8`. **Chưa verify được đường AI trên production** vì cần đăng nhập
— user phải tự bấm thử.

**Status:** resolved ở code + env; chờ user xác nhận trên production.

---

## [Hotfix 2026-08-18c] Groq tính TPM theo `max_completion_tokens` ĐẶT TRƯỚC, không phải token thực dùng — Tier: Moderate

**Triệu chứng user báo:** bấm vào một từ để dùng chức năng vocabulary hoặc nút
"Vn" (dịch tiếng Việt) thì thường xuyên hiện "Failed — tap to retry".

**Finding (nguyên nhân chính):** Groq trừ hạn mức tokens-per-minute theo **budget
đăng ký trước** (`max_completion_tokens`), KHÔNG phải theo số token model thực sự
sinh ra. `provider.ts` áp `AI_MAX_TOKENS` (default 5000) cho MỌI lời gọi, kể cả
lời dịch một cụm từ chỉ tốn 44–150 token completion.

Đo thực tế trên account (`on_demand`, trần 8.000 TPM), 1 lần bấm "Vn":

| max_completion_tokens | TPM bị trừ | Số lần bấm/phút | Kết quả |
|---|---|---|---|
| 5000 (cũ) | 5.157 | ~1,5 | lần bấm thứ 2 trong cùng phút → **HTTP 429** |
| 700 (mới) | ~1.030 | ~7–8 | 14 lần bấm liên tiếp: 14/14 OK |

Log lỗi gốc từ Groq: `Rate limit reached ... TPM: Limit 8000, Used 5181,
Requested 5157`. Route `/api/vocab/vietnamese` bắt exception → trả 502 → UI hiện
"Failed — tap to retry". Đây là lý do lỗi xuất hiện "thường xuyên" chứ không phải
ngẫu nhiên: gần như bất kỳ lần bấm thứ hai nào trong vòng 1 phút đều fail.

**Finding phụ (khuếch đại lỗi):** cache nghĩa tiếng Việt **chưa bao giờ ghi được**.
Bước 8a trong `/api/vocab/vietnamese` dùng `UPDATE ... .eq('headword', x)
.eq('vi_meaning','')`, nhưng đa số từ user bấm chưa từng đi qua
`/api/vocab/lookup` nên KHÔNG có row `vocab_definitions` để update → update khớp
0 row, im lặng, không báo lỗi. Hệ quả: mỗi lần bấm "Vn" trên cùng một từ đều gọi
LLM lại từ đầu, nhân số lần đụng trần TPM lên nhiều lần.

**How it was handled (Moderate — tự xử lý, không đổi kiến trúc):**
1. `src/lib/ai/provider.ts`: tách budget theo từng lời gọi (`CallOptions.maxTokens`).
   `callAISmall` mặc định `AI_MAX_TOKENS_SMALL` (default **700**). Lời gọi lớn
   (`/api/suggest`) giữ nguyên `AI_MAX_TOKENS` = 5000.
2. `src/lib/ai/provider.ts`: đọc header `retry-after` vào `ProviderError.retryAfter`,
   và tự retry MỘT lần khi gặp 429 nếu `retry-after` ≤ 8s. Ngưỡng 8s để lời gọi lớn
   (retry-after ~18s) không biến thành treo UI.
3. `/api/vocab/lookup`: định nghĩa từ điển cũng dùng budget nhỏ (`smallMaxTokens()`).
4. `/api/vocab/vietnamese`: đổi ghi cache nghĩa từ UPDATE sang **upsert**
   (`onConflict: 'headword'`) → cache thật sự hoạt động, bấm lại cùng một từ
   không tốn TPM nữa.
5. Hệ quả của (4): upsert tạo row `vocab_definitions` chỉ có `vi_meaning`, chưa có
   `definition`. Vì vậy `/api/vocab/lookup` phải thêm `.neq('definition','')` khi
   đọc cache (nếu không sẽ trả definition RỖNG như một cache hit hợp lệ), và bước
   ghi của nó đổi sang upsert để điền tiếp vào row stub thay vì đụng unique violation.
6. `VocabPopover.tsx`: phân biệt rate-limit với lỗi thật — hiện "Too busy — retry
   in Ns" thay vì "Failed", và hiện message thật của server thay vì nuốt nó.

**Verify:** 14 lần gọi liên tiếp qua đúng module `provider.ts` thật: 14/14 thành
công (trước fix: lần thứ 2 đã 429). Chuỗi "Fix my English" (budget lớn) rồi bấm
"Vn" ngay sau đó: OK trong 608ms. `npx tsc --noEmit` sạch, `npm run build` sạch,
354/354 test pass.

**Lưu ý cho sau này:** KHÔNG nâng `AI_MAX_TOKENS_SMALL` lên cao "cho chắc" —
mỗi token trong budget là một token bị trừ khỏi trần 8.000/phút, dù không dùng tới.
Đo completion thực tế trước khi tăng.

**Status:** resolved.

---

## [Hotfix 2026-08-18b] `gpt-oss-120b` là reasoning model — cạn budget, trả content rỗng — Tier: Moderate

**Finding:** Sau khi đổi sang `openai/gpt-oss-120b`, lỗi 404 hết nhưng nút "Fix
my English" VẪN hỏng. Log production cho thấy một lỗi KHÁC:

    [ai/provider] response_format not supported by model; retrying without it.
    [/api/suggest] parseSuggestion returned null. Raw:        ← raw RỖNG

Nguyên nhân: `gpt-oss-120b` là **reasoning model**. Với entry dài thật (8 đoạn):
- `max_completion_tokens` mặc định của provider là **3072**. Model tiêu 3070
  token cho reasoning → `message.content` = "" (rỗng), `finish_reason=length`.
- Ở chế độ `response_format: json_object`, Groq trả **HTTP 400
  `json_validate_failed`** thay vì trả JSON hỏng.
- `provider.ts` hiểu nhầm mọi 400 là "model không hỗ trợ response_format" → gọi
  lại lần 2 không có json mode → lại cạn budget → content rỗng → parse null → 502.

Test trước đó của tôi lọt lưới vì chỉ dùng entry 2 đoạn ngắn — đủ chỗ trống nên
không chạm trần token. Entry thật mới lộ ra.

**Giới hạn tài khoản Groq (on_demand tier) — quan trọng cho phase sau:**

| model | TPM | RPM |
|---|---|---|
| openai/gpt-oss-120b | 8.000 | 1.000 |
| openai/gpt-oss-20b | 8.000 | 1.000 |
| qwen/qwen3.6-27b | 8.000 | 1.000 |
| groq/compound(-mini) | 70.000 | 250 |

`groq/compound` nhìn có vẻ rộng rãi nhưng **route ngầm về `gpt-oss-120b` và dính
đúng trần 8.000 TPM**; `compound-mini` trả content rỗng. Cả hai đều loại.

Một lượt stage 1 tốn ~4.200 token (in 1.621 + out 2.625) → **8.000 TPM chỉ đủ
~1,9 lượt/phút**. Bấm stage 2 ngay sau stage 1 sẽ dính 429. Đây là giới hạn gói
Groq, không phải bug code — route đã map 429 → 503 "The AI service is busy."

**How it was handled:** sửa `src/lib/ai/provider.ts`:
1. Thêm `reasoning_effort` (env `AI_REASONING_EFFORT`, mặc định `low`) cho các
   model reasoning (`gpt-oss|qwen|deepseek-r1`) → reasoning giảm 3070 → 528 token.
2. Thêm `max_completion_tokens` (env `AI_MAX_TOKENS`, mặc định **5000**). KHÔNG
   đặt cao hơn: input + budget phải nằm dưới trần TPM, nếu không Groq trả
   **HTTP 413 "Request too large"** (đã kiểm chứng với 8000).
3. Chỉ retry-bỏ-response_format khi code **khác** `json_validate_failed` — vì
   json_validate_failed nghĩa là response_format ĐÃ được chấp nhận, bỏ đi chỉ
   tốn thêm một lượt gọi.
4. Lỗi provider nay kèm code + message thật thay vì chỉ "Provider HTTP 400".
5. Ném lỗi rõ ràng khi content rỗng (kèm `finish_reason`) thay vì để
   `parseSuggestion` trả null một cách khó hiểu.

**Verify (entry thật 8 đoạn, ~1.800 ký tự):**
- STAGE 1: `finish=stop`, 8→8 đoạn, 35 changes, **35/35 verbatim**, feedback 257 ký tự, 6,9s.
- STAGE 2: `finish=stop`, 8→8 đoạn, 23 changes, 22/23 verbatim, feedback 417 ký tự.
- `npx tsc --noEmit` sạch, `npm run build` sạch, 322 test offline pass.

**Còn lại:** cần deploy code mới lên production (`vercel --prod`). Việc đổi env
`AI_MODEL` trên Vercel đã xong lúc 14:12 ngày 2026-08-18.

**Status:** resolved ở local + đã verify với API thật; chờ deploy production.

---

## [Hotfix 2026-08-18] Groq đã khai tử `llama-3.3-70b-versatile` — Tier: Moderate

**Finding:** Nút "Fix my English" trên production báo lỗi ("The note came back
blank"). Nguyên nhân KHÔNG phải Vercel: Groq đã gỡ model
`llama-3.3-70b-versatile` khỏi API. Gọi thẳng
`POST https://api.groq.com/openai/v1/chat/completions` với `AI_MODEL` cũ trả về:

    HTTP 404 — "The model `llama-3.3-70b-versatile` does not exist or you do
    not have access to it." (code: model_not_found)

`GET /v1/models` với đúng API key hiện chỉ còn: `openai/gpt-oss-120b`,
`openai/gpt-oss-20b`, `qwen/qwen3.6-27b`, `groq/compound`, `groq/compound-mini`,
cùng các model whisper/orpheus/prompt-guard. Không còn model llama nào.

**Impact:** Mọi tính năng AI hỏng ở CẢ local lẫn production — `/api/suggest`
stage 1 và 2, và `/api/vocab/vietnamese` (dùng `callAISmall`, mà `AI_MODEL_SMALL`
chưa set nên fallback về `AI_MODEL`). Provider ném lỗi status 404; `callAI` chỉ
retry cho status 400 nên không cứu được; route trả 502 "Could not reach the AI
service."; UI hiển thị thông báo chung chung nên không lộ nguyên nhân thật.

**How it was handled:** Đổi `AI_MODEL=openai/gpt-oss-120b` trong `.env.local`.
Không sửa code — tên model chỉ đến từ env, không hardcode ở đâu trong `src/`.
Đã probe cả ba prompt thật với model mới:
- STAGE1_PROMPT: giữ đúng 2/2 đoạn, 10-11 changes, 100% `corrected` là substring
  verbatim của `corrected_version`, ~4.9s.
- STAGE2_PROMPT: 2/2 đoạn, 5-7 changes, 100% verbatim, ~3.9s.
- VIETNAMESE_PROMPT: JSON hợp lệ, tiếng Việt tự nhiên, ~1s.
- `response_format: {type:'json_object'}` được hỗ trợ → nhánh retry-on-400 không
  kích hoạt.

Đã loại `openai/gpt-oss-20b` (trả content rỗng với prompt dài của stage 1) và
`qwen/qwen3.6-27b` (rò `<think>` ra output, JSON mode fail).

**Còn lại cho user:** biến `AI_MODEL` trên Vercel vẫn là giá trị cũ — phải sửa
trên dashboard rồi redeploy. Session này không có quyền truy cập Vercel.

**Status:** resolved ở local; chờ user cập nhật env trên Vercel.

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
