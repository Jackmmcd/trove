import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * The signed-in user's past Analyst threads, newest first.
 *
 * `updated_at` is only ever written at insert time by the chat route, so it
 * ranks identically to `created_at`; ordering on created_at avoids depending on
 * a column nothing maintains. Capped at 200 — well under the PostgREST row
 * limit, and nobody scrolls a sidebar further than that.
 */
export async function GET() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data, error } = await db
    .from('advisor_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    conversations: (data ?? []).map(c => ({
      id: c.id as string,
      title: (c.title as string | null) ?? 'Untitled',
      createdAt: c.created_at as string,
      updatedAt: (c.updated_at as string | null) ?? (c.created_at as string),
    })),
  });
}
