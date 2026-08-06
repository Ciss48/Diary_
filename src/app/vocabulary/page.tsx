import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTodayInTimezone } from '@/lib/dates'
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
      vocab_definitions ( id, ipa, part_of_speech, definition, example, source ),
      entries ( entry_date )
    `)
    .order('created_at', { ascending: false })

  const items: LibraryVocabItem[] = (vocabRows ?? []).map(row => ({
    id: row.id,
    display_form: row.display_form,
    original_form: row.original_form,
    headword: row.headword,
    change_type: row.change_type,
    status: row.status as 'learning' | 'known',
    created_at: row.created_at,
    entry_id: row.entry_id,
    definition: row.vocab_definitions
      ? (row.vocab_definitions as unknown as LibraryVocabItem['definition'])
      : null,
    entry_date: (row.entries as unknown as { entry_date: string })?.entry_date ?? '',
  }))

  return (
    <VocabLibrary
      items={items}
      timezone={tz}
      today={today}
    />
  )
}
