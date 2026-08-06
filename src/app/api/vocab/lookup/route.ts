import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates';
import { callAI } from '@/lib/ai/provider';
import {
  normaliseHeadword,
  routeLookup,
  lookupDictionary,
  selectSense,
  parseLookupResponse,
  DEFINITION_PROMPT,
  type LookupResult,
} from '@/lib/vocab';

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
  let headword: string;
  let pos: string;
  try {
    const body = await req.json();
    headword = body?.headword;
    pos = body?.pos ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!headword) {
    return NextResponse.json({ error: 'headword is required.' }, { status: 400 });
  }

  // 3. Normalise
  const normHeadword = normaliseHeadword(headword);
  if (!normHeadword) {
    return NextResponse.json({ error: 'Invalid headword.' }, { status: 400 });
  }

  // 4. Check cache
  const { data: cached } = await supabase
    .from('vocab_definitions')
    .select('id, headword, ipa, part_of_speech, definition, example, source')
    .eq('headword', normHeadword)
    .single();

  if (cached) {
    // Link to any saved_vocab rows for this user that lack a definition_id
    await supabase
      .from('saved_vocab')
      .update({ definition_id: cached.id })
      .eq('user_id', user.id)
      .eq('headword', normHeadword)
      .is('definition_id', null);

    return NextResponse.json({ definition: cached, fromCache: true });
  }

  // 5. Route: dictionary or LLM
  const route = routeLookup(normHeadword, pos);

  // 6. Rate limit for LLM lookups only
  if (route === 'llm') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .single();
    const tz = profile?.timezone ?? 'Asia/Ho_Chi_Minh';
    const today = getTodayInTimezone(tz);

    const limit = Number(process.env.LOOKUP_DAILY_LIMIT ?? 30);

    // Count LLM lookups today by checking vocab_definitions inserted today with source='llm'
    // This is an approximation — in practice, the limit is generous enough
    const { count } = await supabase
      .from('vocab_definitions')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'llm')
      .gte('fetched_at', `${today}T00:00:00+07:00`);

    const used = count ?? 0;
    if (used >= limit) {
      return NextResponse.json(
        { error: 'Daily lookup limit reached.', definition: null },
        { status: 429 },
      );
    }
  }

  // 7. Fetch definition
  let result: LookupResult | null = null;
  let source: 'dictionary' | 'llm' = route;

  if (route === 'dictionary') {
    const dictEntries = await lookupDictionary(normHeadword);
    if (dictEntries) {
      result = selectSense(dictEntries, pos);
      source = 'dictionary';
    } else {
      // Dictionary miss — fall back to LLM
      source = 'llm';
    }
  }

  if (!result) {
    // LLM path
    try {
      const raw = await callAI(DEFINITION_PROMPT, normHeadword);
      result = parseLookupResponse(raw);
      source = 'llm';
    } catch (err) {
      console.error('[/api/vocab/lookup] LLM call failed:', (err as Error).message);
    }
  }

  if (!result) {
    return NextResponse.json(
      { error: 'Could not fetch definition.', definition: null },
      { status: 502 },
    );
  }

  // 8. Insert into vocab_definitions using service role (bypasses RLS)
  const serviceClient = createServiceClient();
  const { data: inserted, error: insertError } = await serviceClient
    .from('vocab_definitions')
    .insert({
      headword: normHeadword,
      ipa: result.ipa,
      part_of_speech: result.part_of_speech,
      definition: result.definition,
      example: result.example,
      source,
    })
    .select('id, headword, ipa, part_of_speech, definition, example, source')
    .single();

  // ON CONFLICT: if another request inserted the same headword concurrently,
  // fetch the existing row instead
  let definition = inserted;
  if (insertError) {
    if (insertError.code === '23505') {
      // Unique violation — another request won the race
      const { data: existing } = await supabase
        .from('vocab_definitions')
        .select('id, headword, ipa, part_of_speech, definition, example, source')
        .eq('headword', normHeadword)
        .single();
      definition = existing;
    } else {
      console.error('[/api/vocab/lookup] insert failed:', insertError.message);
      return NextResponse.json(
        { error: 'Could not cache definition.', definition: null },
        { status: 500 },
      );
    }
  }

  if (!definition) {
    return NextResponse.json(
      { error: 'Could not cache definition.', definition: null },
      { status: 500 },
    );
  }

  // 9. Link to saved_vocab rows for this user
  await supabase
    .from('saved_vocab')
    .update({ definition_id: definition.id })
    .eq('user_id', user.id)
    .eq('headword', normHeadword)
    .is('definition_id', null);

  return NextResponse.json({ definition, fromCache: false });
}
