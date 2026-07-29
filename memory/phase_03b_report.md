# Phase 03b Report — Month Calendar + Mood

**Completed:** 2026-07-29
**Status:** DONE ✓ — verified by user 2026-07-29

## What was built

### New files
- `supabase/migrations/0003_entry_mood.sql` — adds `mood text` column + `entries_mood_check` constraint (happy/normal/sad/null)
- `src/lib/calendar.ts` — pure functions: `isValidMonthString`, `previousMonth`, `nextMonth`, `monthOf`, `buildMonthGrid` (6×7=42 cells, Mon–Sun, padding cells get correct state/mood)
- `scripts/test_calendar.mjs` — 42 assertions; all pass
- `src/components/MoodPicker.tsx` — 3 round toggle buttons (happy/normal/sad); re-click deselects; `aria-label` + `title` on each; `aria-pressed`
- `src/components/MonthCalendar.tsx` — server component; prev/next month links (next disabled at current month); 7-col grid with 4 cell states + 6px mood dot top-right; legend

### Modified files
- `src/lib/streaks.ts` — added `Mood` type; added `mood?: Mood | null` to `EntryLite` (optional — existing tests unaffected)
- `src/lib/entries.ts` — added `mood` to `Entry` type; `saveEntry` gains optional `mood?` 4th param (INSERT writes it; UPDATE writes it only if param !== undefined); new `updateMood(date, mood)` function returns null without creating a row if entry doesn't exist
- `src/components/DiaryEditor.tsx` — mood state + `moodRef` + `entryExistsRef`; `MoodPicker` placed in header (same line as backfill badge); `handleMoodChange` calls `updateMood` if entry exists, otherwise holds mood for first INSERT
- `src/app/page.tsx` — `searchParams` properly awaited (Next.js 16 Promise); month param validated + clamped to current; `canGoNext` logic; `mood` included in SELECT; `MonthCalendar` rendered between heatmap and "Write today" button

## Test results

- `node scripts/test_calendar.mjs` — 42/42 pass ✓
- `node scripts/test_streaks.mjs` — 32/32 pass ✓ (no regression)
- `node scripts/test_dates.mjs` — 21/21 pass ✓ (no regression)
- `npm run build` — clean, no warnings ✓

## Definition of Done — status

- [x] `node scripts/test_dates.mjs`, `node scripts/test_streaks.mjs`, `node scripts/test_calendar.mjs` — cả ba pass 100% — **verified**: 21+32+42 = 95 assertions, 0 failures
- [x] `npm run build` thành công, không warning — **verified**: build clean
- [x] Trang `/` hiển thị theo thứ tự: stats → heatmap 53 tuần (KHÔNG đổi) → lịch tháng → nút viết — **verified by user**
- [x] Bấm `‹`/`›` điều hướng tháng; nút `›` disabled ở tháng hiện tại — **verified by user**
- [x] `/?month=2026-13` hoặc `/?month=abc` → không crash, hiện tháng hiện tại — **verified by user**
- [x] `/?month=2027-01` → hiện tháng hiện tại — **verified by user**
- [x] Mood picker nằm ở header; chọn Happy → chấm vàng trên lịch sau refresh — **verified by user**
- [x] Toggle Sad/Normal/deselect — **verified by user**
- [x] Mở ngày quá khứ chưa có entry, bấm mood trước khi gõ → 0 row trong DB — **verified by user**
- [x] Constraint `angry` bị từ chối — **verified by user**
- [x] Ô backfill giữ viền đứt; mood dot không đè state signal — **verified by user**
- [x] User dọn dữ liệu test sau verify — **verified by user**

## Minor tweak after initial code (2026-07-29)

`src/components/MonthCalendar.tsx` — mood dot visual tweak (Minor, per protocol):
- Size: `h-1.5 w-1.5` → `h-3 w-3` (~12px)
- Position: removed `absolute top-0.5 right-0.5` pinning; now uses `absolute inset-0 flex items-center justify-center pointer-events-none` overlay so the dot is centered in the cell without displacing the day number or blocking link clicks
- Legend swatches updated to match: `h-1.5 w-1.5` → `h-3 w-3`
- `npm run build` clean after change.

## Discoveries

None (Moderate or Major). All implementation matched the spec.

## Input for the next phase (Phase 4 — Photos)

`DiaryEditor.tsx` structure AFTER Phase 03b:
- Located at `src/components/DiaryEditor.tsx`
- `'use client'` component
- Props: `{ date: string, timezone: string }`
- Internal state: `content`, `wordCount`, `saveStatus`, `isBackfill`, `loading`, `mood`
- Refs: `lastSavedContent`, `debounceTimer`, `moodRef`, `entryExistsRef`
- Header section: date title + (backfill badge + MoodPicker) in same row + "← Home" link
- Editor: textarea with debounce 1500ms + onBlur save
- Footer: word count + save status
- **Natural insertion point for photo strip (Phase 4):** between the textarea and the footer div — a `<PhotoStrip entryDate={date} />` client component fits there, same as the plan noted in Phase 3 report.
