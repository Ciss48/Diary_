import { createClient } from '@/lib/supabase/client'
import { getTodayInTimezone, countWords } from '@/lib/dates'
import type { Mood } from '@/lib/streaks'

export type Entry = {
  id: string
  entry_date: string
  content: string
  word_count: number
  is_backfill: boolean
  mood: Mood | null
  created_at: string
  updated_at: string
}

const ENTRY_COLS = 'id, entry_date, content, word_count, is_backfill, mood, created_at, updated_at'

/** null nếu ngày đó chưa có entry */
export async function fetchEntry(date: string): Promise<Entry | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('entries')
    .select(ENTRY_COLS)
    .eq('entry_date', date)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Nếu entry đã tồn tại → UPDATE content + word_count (KHÔNG đụng is_backfill).
 *   mood chỉ được ghi vào UPDATE khi tham số mood !== undefined.
 * Nếu chưa → INSERT với is_backfill = (date < getTodayInTimezone(tz)).
 *   mood ghi vào row mới (null nếu không truyền).
 * Hai nhánh tách biệt để bảo toàn luật is_backfill-set-một-lần.
 */
export async function saveEntry(
  date: string,
  content: string,
  tz: string,
  mood?: Mood | null
): Promise<Entry> {
  const supabase = createClient()
  const wc = countWords(content)

  // Kiểm tra entry đã tồn tại chưa
  const existing = await fetchEntry(date)

  if (existing) {
    // UPDATE — KHÔNG đụng is_backfill; mood chỉ ghi khi được truyền
    const updatePayload: Record<string, unknown> = { content, word_count: wc }
    if (mood !== undefined) updatePayload.mood = mood

    const { data, error } = await supabase
      .from('entries')
      .update(updatePayload)
      .eq('id', existing.id)
      .select(ENTRY_COLS)
      .single()

    if (error) throw error
    return data
  } else {
    // INSERT — set is_backfill một lần duy nhất
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const isBackfill = date < getTodayInTimezone(tz)
    const { data, error } = await supabase
      .from('entries')
      .insert({
        user_id: user.id,
        entry_date: date,
        content,
        word_count: wc,
        is_backfill: isBackfill,
        mood: mood ?? null,
      })
      .select(ENTRY_COLS)
      .single()

    if (error) throw error
    return data
  }
}

/**
 * Chỉ UPDATE mood của entry đã tồn tại.
 * Nếu chưa có entry cho ngày đó → trả về null và KHÔNG tạo row mới
 * (tránh sinh entry rỗng làm sáng heatmap).
 */
export async function updateMood(date: string, mood: Mood | null): Promise<Entry | null> {
  const supabase = createClient()

  const existing = await fetchEntry(date)
  if (!existing) return null

  const { data, error } = await supabase
    .from('entries')
    .update({ mood })
    .eq('id', existing.id)
    .select(ENTRY_COLS)
    .single()

  if (error) throw error
  return data
}
