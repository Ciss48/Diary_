import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isValidDateString, isFutureDate, getTodayInTimezone } from '@/lib/dates'
import DiaryEditor from '@/components/DiaryEditor'
import { filterChanges } from '@/lib/suggestions'
import type { StoredSuggestion } from '@/lib/suggestions'

interface Props {
  params: Promise<{ date: string }>
}

export default async function DiaryPage({ params }: Props) {
  const { date } = await params

  // Validate format + lịch
  if (!isValidDateString(date)) {
    notFound()
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Lấy timezone của user
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single()

  const tz = profile?.timezone ?? 'Asia/Ho_Chi_Minh'

  // Chặn ngày tương lai
  if (isFutureDate(date, tz)) {
    redirect('/')
  }

  // Load entry id so we can query suggestions
  const { data: entry } = await supabase
    .from('entries')
    .select('id')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .single()

  // Load most recent suggestion for this entry (null if no entry yet)
  let initialSuggestion: StoredSuggestion | null = null
  if (entry?.id) {
    const { data: raw } = await supabase
      .from('ai_suggestions')
      .select('id, source_content, corrected_version, changes, overall_feedback, created_at')
      .eq('entry_id', entry.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (raw) {
      initialSuggestion = {
        ...raw,
        changes: filterChanges(Array.isArray(raw.changes) ? raw.changes : []),
      }
    }
  }

  // Remaining suggestions for today
  const today = getTodayInTimezone(tz)
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 5)
  const { count } = await supabase
    .from('ai_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('usage_date', today)
  const initialRemaining = Math.max(0, limit - (count ?? 0))

  return (
    <DiaryEditor
      date={date}
      timezone={tz}
      initialSuggestion={initialSuggestion}
      initialRemaining={initialRemaining}
    />
  )
}
