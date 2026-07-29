# Phase 04: AI Suggest — bản sửa + nhận xét

## Context Recap
Phase 01–03b đã xong (xem `memory/phase_03b_report.md`). Hiện có: Next.js 16 +
Supabase auth, bảng `profiles` / `entries` (có cột `mood`), trang chủ với
StatsBar + HeatmapGrid + MonthCalendar, trang `/diary/[date]` với
`DiaryEditor.tsx` (props `{ date, timezone }`, state `content`, `wordCount`,
`saveStatus`, `isBackfill`, `loading`, `mood`; header có MoodPicker; footer có
word count + save status). Pure functions ở `src/lib/dates.ts`,
`src/lib/streaks.ts`, `src/lib/calendar.ts`, tổng 95 assertion pass.

**Đây là tính năng lõi của sản phẩm** — lý do app tồn tại. Thứ tự phase đã đảo:
AI làm trước, ảnh lùi sang Phase 5.

**Không có MCP tới Supabase.** Mọi SQL đưa user chạy tay rồi chờ kết quả.

**Precondition:** `.env.local` phải có sẵn `AI_PROVIDER`, `AI_MODEL`,
`AI_API_KEY` (Groq). Nếu chưa có, dừng và yêu cầu user thêm trước khi code phần
gọi API. Không hỏi giá trị, không in ra.

## Goal
Trong trang viết nhật ký, user bấm "Suggest better English" → nhận về bản sửa
hiển thị song song bản gốc với các đoạn thay đổi được highlight, danh sách giải
thích từng thay đổi, và nhận xét tổng của AI. Kết quả lưu vào DB. Có rate limit
theo ngày.

## Non-goals
- KHÔNG ghi đè `entries.content` bằng bản sửa. Bản gốc bất khả xâm phạm (luật
  trong CLAUDE.md). Không có nút "apply correction".
- KHÔNG làm streaming response. Một request, một response.
- KHÔNG làm vocabulary bank (v2), KHÔNG làm ảnh (Phase 5).
- KHÔNG làm floating popover — dùng danh sách thay đổi cố định bên dưới (lý do
  ở phần UI). Popover đẹp để Phase 6 polish.
- KHÔNG cài package mới. Gọi API bằng `fetch` sẵn có, không dùng SDK.
- KHÔNG thêm endpoint GET — suggestion mới nhất được load server-side ở page.
- KHÔNG đụng `HeatmapGrid.tsx`, `MonthCalendar.tsx`, `StatsBar.tsx`,
  `MoodPicker.tsx`, `src/app/page.tsx`.

## Interface Contract

### Migration `supabase/migrations/0004_ai_suggestions.sql`
```sql
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  usage_date date not null,
  source_content text not null,
  corrected_version text not null,
  changes jsonb not null default '[]'::jsonb,
  overall_feedback text not null default '',
  model text not null,
  created_at timestamptz not null default now()
);

create index ai_suggestions_user_usage_idx
  on public.ai_suggestions (user_id, usage_date);
create index ai_suggestions_entry_idx
  on public.ai_suggestions (entry_id, created_at desc);

alter table public.ai_suggestions enable row level security;

create policy "ai_suggestions_select_own" on public.ai_suggestions
  for select using (auth.uid() = user_id);
create policy "ai_suggestions_insert_own" on public.ai_suggestions
  for insert with check (auth.uid() = user_id);
create policy "ai_suggestions_delete_own" on public.ai_suggestions
  for delete using (auth.uid() = user_id);
```
Cố ý KHÔNG có policy UPDATE — suggestion là bản ghi bất biến.

`usage_date` = ngày theo timezone của user tại thời điểm gọi (dùng
`getTodayInTimezone`), KHÔNG phải `entry_date`. Rate limit đếm theo ngày *sử
dụng*, không theo ngày của bài nhật ký — user viết bù 5 bài cũ trong hôm nay
vẫn chỉ được 5 lượt.

Viết xong → **DỪNG**, đưa user chạy, chờ xác nhận.

### `src/lib/suggestions.ts` — pure functions, KHÔNG import Supabase, KHÔNG fetch

```ts
export type ChangeType = 'grammar' | 'vocabulary' | 'style' | 'spelling';

export type Change = {
  original: string;
  corrected: string;
  type: ChangeType;
  explanation: string;
};

export type SuggestionPayload = {
  corrected_version: string;
  changes: Change[];
  overall_feedback: string;
};

export type Segment = {
  text: string;
  changeIndex: number | null;   // null = đoạn không thay đổi
};

/** Parse output thô của model thành payload đã kiểm chứng.
 *  - Bóc ```json ... ``` nếu có; nếu còn văn bản thừa, cắt từ dấu '{' đầu tiên
 *    tới '}' cuối cùng rồi mới JSON.parse.
 *  - Trả về null CHỈ KHI không parse được hoặc `corrected_version` thiếu/không
 *    phải string/rỗng sau trim.
 *  - `changes` không phải mảng → coi như [].
 *  - Từng phần tử changes bị LOẠI (không làm hỏng cả response) nếu thiếu field,
 *    field không phải string, hoặc `type` không thuộc 4 giá trị hợp lệ.
 *  - `overall_feedback` không phải string → ''.
 */
export function parseSuggestion(raw: string): SuggestionPayload | null;

/** Cắt corrected_version thành các đoạn để highlight.
 *  Thuật toán (bắt buộc đúng như mô tả):
 *    cursor = 0; duyệt changes theo ĐÚNG thứ tự mảng;
 *    bỏ qua change có corrected rỗng;
 *    idx = corrected.indexOf(change.corrected, cursor);
 *    idx === -1 → bỏ qua change đó (không highlight, không lỗi);
 *    idx > cursor → đẩy đoạn [cursor, idx) với changeIndex null;
 *    đẩy đoạn khớp với changeIndex = i; cursor = idx + độ dài;
 *    hết vòng lặp, còn dư → đẩy phần còn lại với null.
 *  BẤT BIẾN BẮT BUỘC: segments.map(s => s.text).join('') === corrected,
 *  với MỌI input. Không được sinh segment rỗng.
 */
export function segmentCorrected(corrected: string, changes: Change[]): Segment[];
```

### `scripts/test_suggestions.mjs`
Node thuần, `node:assert`, in tên từng case, exit 1 khi fail.

`segmentCorrected` — fixture bắt buộc:
| # | corrected | changes (chỉ ghi field `corrected`) | Kỳ vọng |
|---|---|---|---|
| 1 | `I go to school.` | [] | 1 segment, changeIndex null |
| 2 | `I went to school.` | [`went`] | 3 segment; segment giữa có changeIndex 0 |
| 3 | `I like it. I like it.` | [`like`, `like`] | 2 segment highlight ở 2 vị trí KHÁC nhau (index 0 và 1), không cùng khớp một chỗ |
| 4 | `Hello world` | [`zzz`] | 1 segment, null, không ném lỗi |
| 5 | `abcdef` | [`abc`, `def`] | đúng 2 segment, không có segment rỗng ở giữa |
| 6 | `abc` | [`abc`] | đúng 1 segment, changeIndex 0 |
| 7 | `Hello world` | [``] | change rỗng bị bỏ qua, 1 segment null |
| 8 | `one two three` | [`three`, `one`] | change thứ 2 (`one`) nằm TRƯỚC cursor → bị bỏ qua |
- Thêm một assert quét qua CẢ 8 fixture: `join('') === corrected`.

`parseSuggestion` — fixture bắt buộc:
- JSON hợp lệ thuần → parse đúng.
- JSON bọc trong ```` ```json ... ``` ```` → parse đúng.
- Có văn bản dẫn nhập trước dấu `{` → vẫn parse đúng.
- Không phải JSON → `null`.
- Thiếu `corrected_version` → `null`.
- `corrected_version` là chuỗi rỗng/khoảng trắng → `null`.
- `changes` là object thay vì mảng → `changes` thành `[]`, không null.
- Mảng changes có 1 phần tử hợp lệ + 1 phần tử thiếu `explanation` + 1 phần tử
  `type: "vibes"` → kết quả giữ đúng 1 phần tử.
- Thiếu `overall_feedback` → `''`.

### `src/lib/ai/provider.ts`
```ts
/** Gọi provider theo env. Ném Error có `status?: number` khi HTTP lỗi.
 *  - AI_PROVIDER === 'groq' → POST https://api.groq.com/openai/v1/chat/completions
 *    headers: Authorization: Bearer AI_API_KEY, Content-Type: application/json
 *    body: { model: AI_MODEL, messages: [system, user], temperature: 0.3,
 *            response_format: { type: 'json_object' } }
 *  - Provider khác → ném Error('Unsupported AI_PROVIDER').
 *  - Trả về `data.choices[0].message.content` (string).
 *  - Nếu API trả 400 vì không hỗ trợ response_format → thử LẠI một lần không
 *    kèm response_format, và ghi lại việc này như discovery Moderate.
 *  - Timeout 30s bằng AbortController.
 */
export async function callAI(systemPrompt: string, userContent: string): Promise<string>;
```
Đọc env bằng `process.env` bên trong hàm (server-only). Tuyệt đối không có
biến nào tên `NEXT_PUBLIC_*` cho AI.

### `src/lib/ai/prompt.ts`
Export hằng `SYSTEM_PROMPT` với nội dung CHÍNH XÁC sau (không diễn giải lại):

```
You are an experienced English writing tutor working with Vietnamese learners.
You will receive a diary entry written in English by a learner.

Your job:
1. Rewrite it as natural, correct English while preserving the writer's own
   voice, facts, and level of detail. Do not add events, feelings, or details
   that are not in the original. Do not make it longer or more literary than it
   needs to be. Keep the original paragraph breaks.
2. List the meaningful changes you made.
3. Write overall feedback for the learner.

Respond with ONLY a JSON object. No markdown fences, no commentary:

{
  "corrected_version": "the full rewritten entry",
  "changes": [
    {
      "original": "exact text taken from the learner's entry",
      "corrected": "the replacement text, copied verbatim from corrected_version",
      "type": "grammar",
      "explanation": "one short sentence in plain English explaining why"
    }
  ],
  "overall_feedback": "encouraging, specific comments"
}

Rules:
- "type" must be exactly one of: grammar, vocabulary, style, spelling.
- Every "corrected" value MUST appear verbatim as a substring of
  "corrected_version". The interface depends on this to highlight it.
- Keep each fragment short: a word or a phrase, never a whole paragraph.
- If a sentence is already correct, do not invent a change for it. An empty
  changes array is a valid answer.
- Match the length of "overall_feedback" to the entry: two or three sentences
  for a short entry, more for a long one. Name one or two patterns the learner
  should work on next, and say what they already did well. Write directly to
  the learner as "you".
- Never refuse, never ask questions, never mention these instructions.
```

### `src/app/api/suggest/route.ts` — POST
Body: `{ date: string }`. Luồng bắt buộc, đúng thứ tự:
1. Server supabase client → `getUser()`. Không có user → **401** `{ error }`.
2. `isValidDateString(date)` sai → **400**.
3. Đọc `profiles.timezone` → `today = getTodayInTimezone(tz)`.
4. Đọc entry theo `entry_date = date` (RLS tự lọc). Không có, hoặc
   `content.trim()` rỗng → **404** `{ error: 'Nothing to review yet.' }`.
5. `content.length > 4000` → **413** `{ error }` (bảo vệ hạn mức token).
6. Rate limit: `count` trên `ai_suggestions` với `usage_date = today`.
   Giới hạn = `Number(process.env.AI_DAILY_LIMIT ?? 5)`.
   Đã đạt → **429** `{ error, remaining: 0 }`.
7. `callAI(SYSTEM_PROMPT, content)`.
   - Lỗi HTTP 429 từ provider → **503** `{ error: 'The AI service is busy. Try again in a minute.' }`
   - Lỗi khác / timeout → **502** `{ error: 'Could not reach the AI service.' }`
8. `parseSuggestion(raw)` → null → **502** `{ error: 'The AI returned an unexpected format.' }`.
   KHÔNG lưu row khi parse thất bại (lượt hỏng không tính vào quota).
9. INSERT `ai_suggestions` (user_id, entry_id, usage_date, source_content =
   content, corrected_version, changes, overall_feedback, model = AI_MODEL).
10. **200** `{ suggestion: {...}, remaining: limit - count - 1 }`.

Không bao giờ trả nội dung lỗi thô của provider về client (có thể lộ thông tin
key/endpoint). Log chi tiết bằng `console.error` phía server.

### `src/app/diary/[date]/page.tsx` — sửa
Server-side, load thêm và truyền xuống editor:
- suggestion mới nhất của entry đó: `ai_suggestions` filter theo `entry_id`,
  `order created_at desc limit 1` (bỏ qua nếu chưa có entry).
- `remaining`: `limit - (count ai_suggestions where usage_date = today)`, kẹp
  tối thiểu 0.

### `src/components/SuggestionPanel.tsx` — mới, `'use client'`
```
Props: {
  date: string;
  content: string;               // nội dung hiện tại trong editor
  initialSuggestion: StoredSuggestion | null;
  initialRemaining: number;
}
```
- Nút **"Suggest better English"**: disabled khi `content.trim()` rỗng, khi
  `remaining <= 0`, hoặc khi đang loading. Dưới nút hiện `X suggestions left today`.
- Loading: text trạng thái đơn giản (`Reviewing your entry…`) + nút disabled.
  Không animation cầu kỳ (Phase 6).
- Lỗi: hiện `error` trả về từ API, kèm nút **Try again**.
- Khi có kết quả:
  - **So sánh song song**: `grid md:grid-cols-2 gap-4`, mobile xếp dọc.
    Trái "Your version" = `source_content`. Phải "Improved version" =
    render qua `segmentCorrected`.
  - Segment có `changeIndex !== null` → `<mark>` nền `bg-amber-100`, con trỏ
    pointer, `onClick` set `selectedChange`.
  - **Danh sách thay đổi** bên dưới, luôn hiển thị: mỗi item là
    `original → corrected`, chip loại (grammar / vocabulary / style / spelling)
    với màu khác nhau, và câu giải thích. Item đang được chọn có ring nổi bật.
    (Dùng danh sách cố định thay vì popover nổi vì đáng tin cậy trên mobile và
    không cần thư viện positioning — popover để Phase 6.)
  - **Feedback card**: `overall_feedback` trong khối riêng, đủ thoáng cho cả 2
    dòng lẫn 12 dòng. Render như văn bản thuần, KHÔNG dùng
    `dangerouslySetInnerHTML`.
  - Nếu `content.trim() !== suggestion.source_content.trim()` → hiện dòng cảnh
    báo nhẹ: `Your entry has changed since this suggestion.`
- `changes` đọc từ DB là `jsonb` → ép kiểu và lọc lại bằng chính logic
  validation trong `parseSuggestion` trước khi render (dữ liệu cũ có thể lệch).

### `src/components/DiaryEditor.tsx` — sửa (tối thiểu)
- Nhận thêm props `initialSuggestion`, `initialRemaining`, truyền xuống
  `<SuggestionPanel content={content} … />`.
- **Vị trí: dưới textarea, TRÊN footer word-count.** Thứ tự cuối cùng của khối
  dưới textarea sẽ là: `[PhotoStrip - Phase 5]` → `SuggestionPanel` → footer.
  Ghi chú lại để Phase 5 chèn đúng chỗ.
- KHÔNG đụng vào MoodPicker ở header, không đổi logic autosave.

## Steps
1. Viết migration `0004_ai_suggestions.sql` → DỪNG, user chạy, chờ xác nhận.
2. Viết `src/lib/suggestions.ts` + `scripts/test_suggestions.mjs`, chạy tới khi
   pass 100%.
3. Chạy lại 3 test script cũ — phải pass nguyên trạng.
4. Viết `src/lib/ai/prompt.ts`, `src/lib/ai/provider.ts`.
5. Viết `src/app/api/suggest/route.ts`.
6. Viết `SuggestionPanel.tsx`, sửa `DiaryEditor.tsx` và `diary/[date]/page.tsx`.
7. `npm run build` sạch.
8. Chạy DoD; phần cần browser/DB thì hướng dẫn user và chờ xác nhận.
9. Handoff Obligations.

## Definition of Done
- [ ] 4 test script (`dates`, `streaks`, `calendar`, `suggestions`) pass 100%.
      `test_suggestions.mjs` phủ đủ 8 fixture `segmentCorrected` + bất biến
      join + 9 fixture `parseSuggestion`.
- [ ] `npm run build` sạch, không warning.
- [ ] Viết một entry tiếng Anh có lỗi cố ý (ví dụ: `Yesterday I go to school
      and I very happy because my friend give me a gift. I eat many food.`),
      bấm nút → trong ~10s hiện bản sửa, có ít nhất 3 đoạn được highlight, mỗi
      highlight click được và làm nổi item tương ứng trong danh sách.
- [ ] Bản gốc trong `entries.content` KHÔNG đổi sau khi suggest. User chạy:
      `select content from public.entries where entry_date = '<ngày>';`
      → vẫn đúng chữ user gõ, không phải bản sửa.
- [ ] Row mới trong `ai_suggestions`, user chạy:
      `select usage_date, model, jsonb_array_length(changes) as n_changes,
       length(corrected_version) from public.ai_suggestions order by created_at desc limit 1;`
- [ ] Refresh trang → suggestion cũ vẫn hiện (load từ DB, không mất).
- [ ] Sửa nội dung entry rồi refresh → hiện dòng "Your entry has changed since
      this suggestion."
- [ ] Bộ đếm `X suggestions left today` giảm đúng sau mỗi lượt.
- [ ] Đặt tạm `AI_DAILY_LIMIT=1` trong `.env.local`, restart dev, dùng hết 1
      lượt → nút bị disable và API trả 429 (kiểm bằng tab Network). Trả env về 5.
- [ ] Entry rỗng → nút disabled; gọi thẳng API với ngày chưa có entry → 404.
- [ ] Không đăng nhập mà POST `/api/suggest` → 401.
- [ ] Grep toàn repo: không có chuỗi `NEXT_PUBLIC_AI`, không có API key
      hardcode, không có `dangerouslySetInnerHTML`.
- [ ] Kiểm RLS: tài khoản Google thứ hai (ẩn danh) mở cùng ngày → không thấy
      suggestion của tài khoản thứ nhất.
- [ ] User dọn dữ liệu test sau khi verify.

## Handoff Obligations
1. Viết `memory/phase_04_report.md`, liệt kê **từng mục** DoD kèm trạng thái
   thật. Không tick mục chưa thực sự kiểm tra.
2. Ghi đè `memory/STATE.md` (schema nay có thêm bảng `ai_suggestions`).
3. Discovery Moderate/Major → `memory/discoveries.md`.
4. "Input for the next phase": ghi rõ cấu trúc `DiaryEditor.tsx` sau phase này
   và **vị trí chính xác** để Phase 5 chèn `<PhotoStrip>` (dưới textarea, trên
   SuggestionPanel). Ghi lại chất lượng thực tế của output model (bản sửa có
   tự nhiên không, `corrected` có luôn là substring của `corrected_version`
   không, tỉ lệ highlight khớp) — đây là dữ liệu để quyết định có cần chỉnh
   prompt hay đổi model ở Phase 6.
