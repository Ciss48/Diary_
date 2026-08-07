import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates';
import { callAISmall } from '@/lib/ai/provider';
import {
  normaliseHeadword,
  normalisePairKey,
  parseVietnameseResponse,
  canHaveExplanation,
  VIETNAMESE_PROMPT,
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
  let fragment: string;
  let original: string;
  try {
    const body = await req.json();
    fragment = body?.fragment;
    original = body?.original ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!fragment || typeof fragment !== 'string') {
    return NextResponse.json({ error: 'fragment is required.' }, { status: 400 });
  }

  // 3. Normalise keys
  const normHeadword = normaliseHeadword(fragment);
  const normCorrected = normalisePairKey(fragment);
  const normOriginal = normalisePairKey(original);
  const hasOriginal = canHaveExplanation(original);

  // 4. Check caches
  let cachedMeaning = '';
  let cachedExplanation = '';
  let meaningFromCache = false;
  let explanationFromCache = false;

  // 4a. Meaning cache (on vocab_definitions)
  if (normHeadword) {
    const { data: defRow } = await supabase
      .from('vocab_definitions')
      .select('vi_meaning')
      .eq('headword', normHeadword)
      .neq('vi_meaning', '')
      .single();

    if (defRow?.vi_meaning) {
      cachedMeaning = defRow.vi_meaning;
      meaningFromCache = true;
    }
  }

  // 4b. Explanation cache (on vi_explanations)
  if (hasOriginal) {
    const { data: explRow } = await supabase
      .from('vi_explanations')
      .select('explanation')
      .eq('norm_corrected', normCorrected)
      .eq('norm_original', normOriginal)
      .single();

    if (explRow?.explanation) {
      cachedExplanation = explRow.explanation;
      explanationFromCache = true;
    }
  }

  // 5. Full cache hit — return immediately, no rate limit cost
  if (meaningFromCache && (explanationFromCache || !hasOriginal)) {
    return NextResponse.json({
      meaning: cachedMeaning,
      explanation: cachedExplanation,
      fromCache: true,
    });
  }

  // 6. Rate limit (counts against LOOKUP_DAILY_LIMIT)
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  const tz = profile?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = getTodayInTimezone(tz);

  const limit = Number(process.env.LOOKUP_DAILY_LIMIT ?? 30);

  // Count LLM lookups today (vocab definitions + vi_explanations created today)
  const { count } = await supabase
    .from('vocab_definitions')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'llm')
    .gte('fetched_at', `${today}T00:00:00+07:00`);

  const used = count ?? 0;
  if (used >= limit) {
    // Still return cached data if we have any
    return NextResponse.json(
      {
        error: 'Daily lookup limit reached.',
        meaning: cachedMeaning,
        explanation: cachedExplanation,
        fromCache: meaningFromCache || explanationFromCache,
      },
      { status: 429 },
    );
  }

  // 7. Call LLM
  const input = hasOriginal
    ? JSON.stringify({ fragment, original })
    : JSON.stringify({ fragment });

  let meaning = cachedMeaning;
  let explanation = cachedExplanation;

  try {
    const raw = await callAISmall(VIETNAMESE_PROMPT, input);
    const parsed = parseVietnameseResponse(raw);

    if (!meaningFromCache && parsed.meaning) {
      meaning = parsed.meaning;
    }
    if (!explanationFromCache && parsed.explanation) {
      explanation = parsed.explanation;
    }
  } catch (err) {
    console.error('[/api/vocab/vietnamese] LLM call failed:', (err as Error).message);
    // Return whatever we have cached
    return NextResponse.json(
      {
        error: 'Could not fetch Vietnamese translation.',
        meaning: cachedMeaning,
        explanation: cachedExplanation,
        fromCache: meaningFromCache || explanationFromCache,
      },
      { status: 502 },
    );
  }

  // 8. Cache results via service role
  const serviceClient = createServiceClient();

  // 8a. Cache meaning on vocab_definitions
  if (!meaningFromCache && meaning && normHeadword) {
    await serviceClient
      .from('vocab_definitions')
      .update({ vi_meaning: meaning, vi_source: 'llm' })
      .eq('headword', normHeadword)
      .eq('vi_meaning', '')
      .then(({ error }) => {
        if (error) console.error('[/api/vocab/vietnamese] meaning cache write failed:', error.message);
      });
  }

  // 8b. Cache explanation
  if (!explanationFromCache && explanation && hasOriginal) {
    await serviceClient
      .from('vi_explanations')
      .insert({
        norm_corrected: normCorrected,
        norm_original: normOriginal,
        explanation,
      })
      .then(({ error }) => {
        // Ignore unique violation (race condition)
        if (error && error.code !== '23505') {
          console.error('[/api/vocab/vietnamese] explanation cache write failed:', error.message);
        }
      });
  }

  return NextResponse.json({
    meaning,
    explanation,
    fromCache: false,
  });
}
