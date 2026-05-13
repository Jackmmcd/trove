import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/auth/session';
import { getTastytradeClient } from '@/lib/tastytrade/client';

export const dynamic = 'force-dynamic';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function fetchHeadlines(): Promise<string[]> {
  const queries = ['S&P 500 market today', 'Federal Reserve economy', 'stock market moves'];
  const results = await Promise.allSettled(
    queries.map(q =>
      axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
        params: { q, quotesCount: 0, newsCount: 8 },
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        timeout: 6000,
      }).then(r => (r.data?.news ?? []).map((n: any) => n.title as string))
    )
  );
  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set<string>();
  return all.filter(t => { if (seen.has(t)) return false; seen.add(t); return true; }).slice(0, 20);
}

async function fetchPortfolioMoves(): Promise<string> {
  try {
    const token = await getValidAccessToken();
    if (!token) return '';
    const client = getTastytradeClient(token);
    const items = await client.getPositions();
    const equities = items.filter((p: any) =>
      (p['instrument-type'] || p.instrumentType) === 'Equity'
    );
    if (!equities.length) return '';
    const lines = equities.map((p: any) => {
      const sym = p.symbol;
      const qty = p.quantity ?? p['quantity-direction'];
      const pl = p['unrealized-day-gain-loss'] ?? p.unrealizedDayGainLoss ?? '';
      return `${sym}: ${qty} shares, day P&L ${pl}`;
    });
    return lines.join('\n');
  } catch { return ''; }
}

export async function GET(req: Request) {
  const date = todayKey();
  const force = new URL(req.url).searchParams.get('force') === '1';

  // Return cached digest if it exists for today (unless force refresh)
  if (!force) {
    const cached = await prisma.dailyDigest.findUnique({ where: { date } });
    if (cached) return NextResponse.json({ success: true, digest: cached.digest, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  const [headlines, portfolioMoves] = await Promise.all([fetchHeadlines(), fetchPortfolioMoves()]);

  const headlineList = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');
  const portfolioSection = portfolioMoves
    ? `\n\nPortfolio positions today:\n${portfolioMoves}`
    : '';

  const prompt = `You are writing a daily market briefing for an individual investor. Based on the headlines below, write a punchy 3-paragraph briefing — no headers, no bullet points, no markdown, plain text only.

Paragraph 1: What is the big story in markets today? Explain it simply — what is happening and why does it matter.
Paragraph 2: What are the most important breaking developments an investor should know right now?
Paragraph 3: ${portfolioMoves ? 'What do these market conditions mean for the portfolio positions listed? Mention any big movers by name.' : 'What should investors be watching for in the near term?'}

Keep it direct, plain English, like a smart friend explaining the markets — not a news anchor, not a financial advisor.${portfolioSection}

Headlines:
${headlineList}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text;
    const digest = raw.split('\n').map(l => l.replace(/^#{1,6}\s+/, '').trim()).filter(Boolean).join('\n\n').trim();

    await prisma.dailyDigest.upsert({
      where: { date },
      create: { date, digest },
      update: { digest },
    });

    return NextResponse.json({ success: true, digest, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
