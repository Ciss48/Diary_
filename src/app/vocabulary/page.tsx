import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTodayInTimezone } from '@/lib/dates'
import { normalisePairKey } from '@/lib/vocab'
import VocabLibrary from '@/components/VocabLibrary'
import type { LibraryVocabItem } from '@/lib/vocabLibrary'

export default async function VocabularyPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // User timezone
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single()

  const tz = profile?.timezone ?? 'Asia/Ho_Chi_Minh'
  const today = getTodayInTimezone(tz)

  // Load all saved vocab with joined definitions and entry dates
  const { data: vocabRows } = await supabase
    .from('saved_vocab')
    .select(`
      id, display_form, original_form, headword, change_type, status, created_at, entry_id,
      vocab_definitions ( id, ipa, part_of_speech, definition, example, source, vi_meaning ),
      entries ( entry_date )
    `)
    .order('created_at', { ascending: false })

  let items: LibraryVocabItem[] = (vocabRows ?? []).map(row => {
    const defRaw = row.vocab_definitions as unknown as (LibraryVocabItem['definition'] & { vi_meaning?: string }) | null
    return {
      id: row.id,
      display_form: row.display_form,
      original_form: row.original_form,
      headword: row.headword,
      change_type: row.change_type,
      status: row.status as 'learning' | 'known',
      created_at: row.created_at,
      entry_id: row.entry_id,
      definition: defRaw
        ? { id: defRaw.id, ipa: defRaw.ipa, part_of_speech: defRaw.part_of_speech, definition: defRaw.definition, example: defRaw.example, source: defRaw.source }
        : null,
      entry_date: (row.entries as unknown as { entry_date: string })?.entry_date ?? '',
      vi_meaning: defRaw?.vi_meaning || '',
    }
  })

  // Batch-query vi_explanations for items that have an original_form
  const pairs = items
    .filter(item => item.original_form?.trim())
    .map(item => ({
      nc: normalisePairKey(item.display_form),
      no: normalisePairKey(item.original_form),
    }))

  if (pairs.length > 0) {
    // Deduplicate pairs to keep query small
    const seen = new Set<string>()
    const uniquePairs = pairs.filter(p => {
      const key = `${p.nc}|${p.no}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const { data: explRows } = await supabase
      .from('vi_explanations')
      .select('norm_corrected, norm_original, explanation')
      .or(
        uniquePairs.map(p =>
          `and(norm_corrected.eq.${p.nc},norm_original.eq.${p.no})`
        ).join(',')
      )

    if (explRows && explRows.length > 0) {
      const explMap = new Map(
        explRows.map(r => [`${r.norm_corrected}|${r.norm_original}`, r.explanation])
      )
      items = items.map(item => {
        if (!item.original_form?.trim()) return item
        const key = `${normalisePairKey(item.display_form)}|${normalisePairKey(item.original_form)}`
        const expl = explMap.get(key)
        return expl ? { ...item, vi_explanation: expl } : item
      })
    }
  }

  return (
    <VocabLibrary
      items={items}
      timezone={tz}
      today={today}
    />
  )
}
