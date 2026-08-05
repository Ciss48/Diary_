import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidDateString, getTodayInTimezone } from '@/lib/dates';
import { callAI } from '@/lib/ai/provider';
import { STAGE1_PROMPT, STAGE2_PROMPT } from '@/lib/ai/prompt';
import { parseSuggestion } from '@/lib/suggestions';

interface ProviderError extends Error {
  status?: number;
}

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
  let date: string;
  let stage: number;
  try {
    const body = await req.json();
    date = body?.date;
    stage = body?.stage ?? 1;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!isValidDateString(date)) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }
  if (stage !== 1 && stage !== 2) {
    return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
  }

  // 3. Timezone → usage_date (the user's local today, not the entry's date)
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  const tz = profile?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = getTodayInTimezone(tz);

  // 4. Load entry
  const { data: entry } = await supabase
    .from('entries')
    .select('id, content')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .single();
  if (!entry || !entry.content?.trim()) {
    return NextResponse.json({ error: 'Nothing to review yet.' }, { status: 404 });
  }

  // 5. Content length guard (protect token quota)
  const content: string = entry.content;
  if (content.length > 4000) {
    return NextResponse.json(
      { error: 'Entry is too long to review (max 4000 characters).' },
      { status: 413 },
    );
  }

  // 6. Rate limit: count by usage_date, not entry_date (all stages count together)
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 5);
  const { count } = await supabase
    .from('ai_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('usage_date', today);
  const used = count ?? 0;
  if (used >= limit) {
    return NextResponse.json(
      { error: `You have used all ${limit} suggestions for today.`, remaining: 0 },
      { status: 429 },
    );
  }

  // 7. Determine prompt and input based on stage
  let systemPrompt: string;
  let userContent: string;
  let parentId: string | null = null;

  if (stage === 2) {
    // Stage 2: load most recent stage-1 suggestion for this entry
    const { data: stage1 } = await supabase
      .from('ai_suggestions')
      .select('id, corrected_version')
      .eq('entry_id', entry.id)
      .eq('stage', 1)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!stage1) {
      return NextResponse.json(
        { error: "Run 'Fix my English' first." },
        { status: 400 },
      );
    }

    systemPrompt = STAGE2_PROMPT;
    userContent = stage1.corrected_version;
    parentId = stage1.id;
  } else {
    systemPrompt = STAGE1_PROMPT;
    userContent = content;
  }

  // 8. Call AI provider
  let raw: string;
  try {
    raw = await callAI(systemPrompt, userContent);
  } catch (err) {
    const providerErr = err as ProviderError;
    console.error('[/api/suggest] AI call failed:', providerErr.message);
    if (providerErr.status === 429) {
      return NextResponse.json(
        { error: 'The AI service is busy. Try again in a minute.' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: 'Could not reach the AI service.' },
      { status: 502 },
    );
  }

  // 9. Parse — failed parse does NOT count against quota (no INSERT)
  const payload = parseSuggestion(raw);
  if (!payload) {
    console.error('[/api/suggest] parseSuggestion returned null. Raw:', raw?.slice(0, 200));
    return NextResponse.json(
      { error: 'The AI returned an unexpected format.' },
      { status: 502 },
    );
  }

  // 10. Persist — only after successful parse
  const model = process.env.AI_MODEL ?? 'unknown';
  const { data: inserted, error: insertError } = await supabase
    .from('ai_suggestions')
    .insert({
      user_id: user.id,
      entry_id: entry.id,
      usage_date: today,
      source_content: userContent,
      corrected_version: payload.corrected_version,
      changes: payload.changes,
      overall_feedback: payload.overall_feedback,
      model,
      stage,
      parent_id: parentId,
    })
    .select('id, source_content, corrected_version, changes, overall_feedback, created_at, stage, parent_id')
    .single();

  if (insertError || !inserted) {
    console.error('[/api/suggest] insert failed:', insertError?.message);
    return NextResponse.json({ error: 'Could not save suggestion.' }, { status: 500 });
  }

  // 11. Success
  const remaining = Math.max(0, limit - used - 1);
  return NextResponse.json({ suggestion: inserted, remaining });
}
