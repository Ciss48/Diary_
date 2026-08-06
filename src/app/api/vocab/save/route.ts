import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normaliseHeadword } from '@/lib/vocab';

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // 2. Validate body
  let entryDate: string;
  let displayForm: string;
  let originalForm: string;
  let headword: string;
  let changeType: string;
  try {
    const body = await req.json();
    entryDate = body?.entry_date;
    displayForm = body?.display_form;
    originalForm = body?.original_form ?? '';
    headword = body?.headword;
    changeType = body?.change_type ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!entryDate || !displayForm || !headword) {
    return NextResponse.json(
      { error: 'entry_date, display_form, and headword are required.' },
      { status: 400 },
    );
  }

  // 3. Normalise headword
  const normHeadword = normaliseHeadword(headword);
  if (!normHeadword) {
    return NextResponse.json({ error: 'Invalid headword.' }, { status: 400 });
  }

  // 4. Look up the entry by date and user
  const { data: entry } = await supabase
    .from('entries')
    .select('id')
    .eq('user_id', user.id)
    .eq('entry_date', entryDate)
    .single();
  if (!entry) {
    return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
  }

  // 5. Check if already saved (unique constraint: user_id, entry_id, headword)
  const { data: existing } = await supabase
    .from('saved_vocab')
    .select('id, display_form, original_form, headword, change_type, status, created_at, definition_id')
    .eq('user_id', user.id)
    .eq('entry_id', entry.id)
    .eq('headword', normHeadword)
    .single();

  if (existing) {
    let definition = null;
    if (existing.definition_id) {
      const { data: defRow } = await supabase
        .from('vocab_definitions')
        .select('id, ipa, part_of_speech, definition, example, source')
        .eq('id', existing.definition_id)
        .single();
      definition = defRow ?? null;
    }
    return NextResponse.json({
      saved: { ...existing, definition },
      alreadyExisted: true,
    });
  }

  // 6. Insert
  const { data: inserted, error: insertError } = await supabase
    .from('saved_vocab')
    .insert({
      user_id: user.id,
      entry_id: entry.id,
      display_form: displayForm,
      original_form: originalForm,
      headword: normHeadword,
      change_type: changeType,
    })
    .select('id, display_form, original_form, headword, change_type, status, created_at')
    .single();

  if (insertError || !inserted) {
    console.error('[/api/vocab/save] insert failed:', insertError?.message);
    return NextResponse.json({ error: 'Could not save term.' }, { status: 500 });
  }

  return NextResponse.json({
    saved: { ...inserted, definition: null },
    alreadyExisted: false,
  });
}
