import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // 2. Delete — RLS ensures only own rows
  const { error } = await supabase
    .from('saved_vocab')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[/api/vocab/[id]] delete failed:', error.message);
    return NextResponse.json({ error: 'Could not delete.' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // 2. Validate body
  let status: string;
  try {
    const body = await req.json();
    status = body?.status;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (status !== 'learning' && status !== 'known') {
    return NextResponse.json(
      { error: 'status must be "learning" or "known".' },
      { status: 400 },
    );
  }

  // 3. Update — RLS ensures only own rows
  const { error } = await supabase
    .from('saved_vocab')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[/api/vocab/[id]] update failed:', error.message);
    return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}
