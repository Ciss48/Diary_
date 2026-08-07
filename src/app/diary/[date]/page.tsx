import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isValidDateString, isFutureDate, getTodayInTimezone } from '@/lib/dates'
import DiaryEditor from '@/components/DiaryEditor'
import { filterChanges } from '@/lib/suggestions'
import type { StoredSuggestion } from '@/lib/suggestions'
import type { SavedVocabItem } from '@/lib/vocab'
import { normalisePairKey } from '@/lib/vocab'

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

  // Load saved vocabulary for this entry (with joined definitions)
  let initialSavedVocab: SavedVocabItem[] = []
  if (entry?.id) {
    const { data: vocabRows } = await supabase
      .from('saved_vocab')
      .select(`
        id, display_form, original_form, headword, change_type, status, created_at,
        vocab_definitions ( id, ipa, part_of_speech, definition, example, source, vi_meaning )
      `)
      .eq('entry_id', entry.id)
      .order('created_at', { ascending: true })

    if (vocabRows) {
      initialSavedVocab = vocabRows.map(row => {
        const defRaw = row.vocab_definitions as unknown as (SavedVocabItem['definition'] & { vi_meaning?: string }) | null
        return {
          id: row.id,
          display_form: row.display_form,
          original_form: row.original_form,
          headword: row.headword,
          change_type: row.change_type,
          status: row.status as 'learning' | 'known',
          created_at: row.created_at,
          definition: defRaw
            ? { id: defRaw.id, ipa: defRaw.ipa, part_of_speech: defRaw.part_of_speech, definition: defRaw.definition, example: defRaw.example, source: defRaw.source }
            : null,
          vi_meaning: defRaw?.vi_meaning || '',
        }
      })

      // Batch-query vi_explanations for items that have an original_form
      const pairs = initialSavedVocab
        .filter(item => item.original_form?.trim())
        .map(item => ({
          nc: normalisePairKey(item.display_form),
          no: normalisePairKey(item.original_form),
        }))

      if (pairs.length > 0) {
        const { data: explRows } = await supabase
          .from('vi_explanations')
          .select('norm_corrected, norm_original, explanation')
          .or(
            pairs.map(p =>
              `and(norm_corrected.eq.${p.nc},norm_original.eq.${p.no})`
            ).join(',')
          )

        if (explRows && explRows.length > 0) {
          const explMap = new Map(
            explRows.map(r => [`${r.norm_corrected}|${r.norm_original}`, r.explanation])
          )
          initialSavedVocab = initialSavedVocab.map(item => {
            if (!item.original_form?.trim()) return item
            const key = `${normalisePairKey(item.display_form)}|${normalisePairKey(item.original_form)}`
            const expl = explMap.get(key)
            return expl ? { ...item, vi_explanation: expl } : item
          })
        }
      }
    }
  }

  return (
    <DiaryEditor
      date={date}
      timezone={tz}
      initialStage1={initialStage1}
      initialStage2={initialStage2}
      initialRemaining={initialRemaining}
      initialSavedVocab={initialSavedVocab}
    />
  )
}
