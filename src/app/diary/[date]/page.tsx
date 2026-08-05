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

  // Load both stages for this entry
  let initialStage1: StoredSuggestion | null = null
  let initialStage2: StoredSuggestion | null = null

  if (entry?.id) {
    // Most recent stage 1 for this entry
    const { data: raw1 } = await supabase
      .from('ai_suggestions')
      .select('id, source_content, corrected_version, changes, overall_feedback, created_at, stage, parent_id')
      .eq('entry_id', entry.id)
      .eq('stage', 1)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (raw1) {
      initialStage1 = {
        ...raw1,
        stage: raw1.stage as 1,
        parent_id: raw1.parent_id as string | null,
        changes: filterChanges(Array.isArray(raw1.changes) ? raw1.changes : []),
      }

      // Most recent stage 2 derived from this stage 1
      const { data: raw2 } = await supabase
        .from('ai_suggestions')
        .select('id, source_content, corrected_version, changes, overall_feedback, created_at, stage, parent_id')
        .eq('parent_id', raw1.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (raw2) {
        initialStage2 = {
          ...raw2,
          stage: raw2.stage as 2,
          parent_id: raw2.parent_id as string | null,
          changes: filterChanges(Array.isArray(raw2.changes) ? raw2.changes : []),
        }
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
      initialStage1={initialStage1}
      initialStage2={initialStage2}
      initialRemaining={initialRemaining}
    />
  )
}
