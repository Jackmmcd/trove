import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { headlines, ticker, mode } = await req.json();
  if (!headlines?.length) return NextResponse.json({ error: 'No headlines' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  const headlineList = headlines.slice(0, 15).map((h: string, i: number) => `${i + 1}. ${h}`).join('\n');

  const prompt = mode === 'market'
    ? `Here are today's top financial news headlines:\n\n${headlineList}\n\nWrite a market digest in 3 short paragraphs: (1) what the main story is today, (2) what it means for investors, (3) what to watch next. Plain English, no jargon, no bullet points, no headers.`
    : `Here are recent news headlines about ${ticker}:\n\n${headlineList}\n\nWrite 3 short paragraphs: (1) what has been happening with this company recently, (2) whether the news looks good or bad for investors and why, (3) what to watch for next. Plain English, be direct, no jargon, no bullet points, no markdown, no headers, no hashtags.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text;
    // Strip markdown headers (# Title, ## Title, etc.) from any line
    const text = raw.split('\n').map(l => l.replace(/^#{1,6}\s+/, '').trim()).filter(Boolean).join('\n\n').trim();
    return NextResponse.json({ success: true, digest: text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
