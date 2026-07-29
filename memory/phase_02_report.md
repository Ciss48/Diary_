# Phase 2 Report — Data model + Diary editor

**Completed:** 2026-07-28
**Status:** DONE ✓

## What was built

- `supabase/migrations/0001_profiles.sql` — profiles table (RLS + trigger handle_new_user)
- `supabase/migrations/0002_entries.sql` — entries table (RLS + set_updated_at trigger)
- `src/lib/dates.ts` — getTodayInTimezone, isFutureDate, isValidDateString, countWords
- `src/lib/entries.ts` — fetchEntry, saveEntry (two-branch: INSERT vs UPDATE)
- `src/app/diary/[date]/page.tsx` — server component, validates date, blocks future dates
- `src/components/DiaryEditor.tsx` — textarea with 1500ms debounce autosave + onBlur save

## DoD verified

- [x] /diary/2026-07-28 loads and shows editor
- [x] Typing and waiting 1.5s → "Saved" appears
- [x] Backfill badge shows on past dates
- [x] Future dates redirect to /

## Bugs fixed during phase

1. **MCP pointing to wrong Supabase project** — was `oodcylqxwqicdeargogz`, fixed to `yxcfgmwvcogsuoxdwycy` in `~/.claude.json`
2. **Migrations applied to wrong project** — had to re-apply 0001 and 0002 to correct project
3. **saveEntry missing user_id in INSERT** — added `supabase.auth.getUser()` and passed `user_id: user.id`
4. **profiles table didn't exist on correct project** — STATE.md was wrong (project was NOT shared; it was a fresh project)

## Key discovery (Moderate)

STATE.md from Phase 1 said the Supabase project was shared with "discipline tracker". This was incorrect — Phase 1 MCP was connected to the wrong project entirely. The actual Diary project (`yxcfgmwvcogsuoxdwycy`) is a fresh project with no pre-existing tables. All migrations were applied fresh.
