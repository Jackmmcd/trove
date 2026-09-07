import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface Block { type: string; text?: string }

/** Ownership check — queries run through the admin client, which bypasses RLS. */
async function ownedBy(conversationId: string, userId: string) {
  const { data } = await db
    .from('advisor_conversations')
    .select('id, title')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const conv = await ownedBy(id, user.id);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const rows = await fetchAllRows<{ role: string; content: Block[] | null; usage: any }>((from, to) =>
    db.from('advisor_messages')
      .select('role, content, usage')
      .eq('conversation_id', id)
      .order('created_at')
      .range(from, to)
  );

  // Stored content is the raw Anthropic block array — thinking and tool_use
  // blocks included. Only the text blocks are replayable as chat bubbles; a
  // turn that was pure tool use has none, so it drops out entirely.
  const messages = rows
    .map(r => ({
      role: r.role as 'user' | 'assistant',
      text: (r.content ?? [])
        .filter(b => b.type === 'text')
        .map(b => b.text ?? '')
        .join(''),
    }))
    .filter(m => m.text.trim());

  return NextResponse.json({ id, title: conv.title ?? 'Untitled', messages });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!(await ownedBy(id, user.id))) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Messages first: if the schema has no cascade, deleting the parent alone
  // would orphan every row in advisor_messages.
  await db.from('advisor_messages').delete().eq('conversation_id', id);
  const { error } = await db
    .from('advisor_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
