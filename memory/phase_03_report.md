# Phase 3 Report — Calendar heatmap + Streak

**Completed:** 2026-07-28
**Status:** DONE ✓

## What was built

- `src/lib/streaks.ts` — 4 pure functions: `previousDay`, `nextDay`, `computeStats`, `buildHeatmapWeeks`
- `scripts/test_streaks.mjs` — 32 assertions covering all 13 computeStats fixtures, 4 previousDay/nextDay fixtures, 6 buildHeatmapWeeks assertions. All pass.
- `src/components/StatsBar.tsx` — server component, 4-stat grid (current streak, longest streak, total entries, total words)
- `src/components/HeatmapGrid.tsx` — server component, CSS grid `grid-flow-col grid-rows-7`, 4 cell states with correct Tailwind classes, amber ring on today, future cells as non-interactive `<div>`, past/present cells as `<Link>`
- `src/app/page.tsx` — rewrote placeholder: fetches entries (RLS auto-filters), computes stats + heatmap, renders StatsBar + HeatmapGrid + "Write today's entry" link

## Definition of Done — status

- [x] `node scripts/test_dates.mjs` pass 100% — **verified**: 21/21 pass
- [x] `node scripts/test_streaks.mjs` pass 100%, phủ đủ 13 fixture computeStats + 4 fixture previousDay/nextDay + 6 assert buildHeatmapWeeks — **verified**: 32/32 pass
- [x] `npm run build` thành công, không warning về missing key — **verified**: build clean, no warnings
- [x] Trang `/` hiển thị heatmap 53 cột, cuộn ngang được, ô hôm nay có ring — **verified by user**
- [x] SQL seed chạy xong, stats đúng: current=2, longest=3, entries=6, words=60; màu ô đúng — **verified by user** (ran Option A: deleted today's Phase 2 test entry first to get clean baseline)
- [x] Click ô đã có entry → sang đúng `/diary/<ngày đó>` và thấy nội dung — **verified by user**
- [x] Click ô tương lai → không xảy ra gì — **verified by user**
- [x] Tài khoản Google thứ hai (incognito) → heatmap trống, stats toàn 0 — **verified by user**
- [x] SQL dọn seed đã chạy — **confirmed by user**

## Minor discovery (recorded below)

Existing Phase 2 test entry (2026-07-28, on-time, 1 word) still in DB at start of Phase 3. Would have made seed verification numbers off by 1 entry / 1 word / +1 current streak. Resolved by having user delete it in Option A of the seed instructions before seeding.

## Input for the next phase (Phase 4 — Photos)

`DiaryEditor.tsx` current structure:
- Located at `src/components/DiaryEditor.tsx`
- `'use client'` component
- Props: `{ initialContent: string, initialWordCount: number, date: string, isBackfill: boolean }`
- Internal state: `content`, `wordCount`, `saveStatus ('idle'|'saving'|'saved'|'error')`
- Debounced autosave (1500ms) + `onBlur` save, both calling `saveEntry(date, content)`
- Renders: backfill badge, textarea, word count + save status footer
- **Natural insertion point for photo strip:** below the textarea, above the word-count footer — a `<PhotoStrip entryDate={date} />` client component could be inserted there. The editor already owns the date context needed to scope photos.
