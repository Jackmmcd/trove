import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const SYSTEM = `You are a sharp equity analyst. Given a company description, output three things in plain English — no jargon, no filler.

Rules:
- Summary: 1–2 sentences max. Explain what the company does and how it makes money, as if explaining to a smart teenager.
- Bull Case: exactly 3 bullets, each under 15 words. Real macro tailwinds specific to this company.
- Bear Case: exactly 3 bullets, each under 15 words. Specific structural risks, not generic ones.
- Every bullet must be a cause → effect statement. No vague claims.

Format exactly:

Summary:
<sentences>

Bull Case:
- <point>
- <point>
- <point>

Bear Case:
- <point>
- <point>
- <point>`;

export async function POST(req: Request) {
  const { description, ticker } = await req.json();
  if (!description || !ticker) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const sym = (ticker as string).toUpperCase();

  const { data: cached } = await db.from('stock_analyses').select('*').eq('ticker', sym).maybeSingle();
  if (cached) {
    return NextResponse.json({
      success: true,
      analysis: `Summary:\n${cached.summary}\n\nBull Case:\n${cached.bull_case}\n\nBear Case:\n${cached.bear_case}`,
      cached: true,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Ticker: ${sym}\n\nDescription: ${description}` }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text;

    const summary = text.match(/Summary:\s*([\s\S]*?)(?=Bull Case:|$)/i)?.[1]?.trim() ?? '';
    const bullRaw = text.match(/Bull Case:\s*([\s\S]*?)(?=Bear Case:|$)/i)?.[1]?.trim() ?? '';
    const bearRaw = text.match(/Bear Case:\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '';

    await db.from('stock_analyses').upsert(
      { ticker: sym, summary, bull_case: bullRaw, bear_case: bearRaw },
      { onConflict: 'ticker' }
    );

    return NextResponse.json({ success: true, analysis: text, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
