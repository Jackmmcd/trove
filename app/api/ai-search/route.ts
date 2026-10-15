import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { checkDailyCap } from '@/lib/advisor/usage';
import { runAiSearch } from '@/lib/ai-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { query } = await req.json().catch(() => ({}));
  const q = typeof query === 'string' ? query.trim().slice(0, 300) : '';
  if (!q) return NextResponse.json({ error: 'Describe what you are interested in.' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  // Shares Analyst's daily spend ceiling.
  const cap = await checkDailyCap();
  if (!cap.allowed) {
    return NextResponse.json({ error: "AI Search has hit today's usage limit. Try again tomorrow." }, { status: 429 });
  }

  try {
    return NextResponse.json(await runAiSearch(q, apiKey));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI Search failed' }, { status: 500 });
  }
}
