import { NextResponse } from 'next/server';
import { getNews } from '@/lib/polygon/client';

export const dynamic = 'force-dynamic';

const BLOCKED = ['motley fool', 'the motley fool', 'benzinga', 'investorplace', 'seeking alpha'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return NextResponse.json({ success: false, error: 'Missing ticker' }, { status: 400 });

  const raw = await getNews(ticker, 20);
  const items = raw
    .filter(n => !BLOCKED.some(b => (n.publisher?.name ?? '').toLowerCase().includes(b)))
    .map(n => ({
      uuid: n.id,
      title: n.title,
      publisher: n.publisher?.name ?? '',
      link: n.article_url,
      publishedAt: Math.floor(new Date(n.published_utc).getTime() / 1000),
      relatedTickers: n.tickers ?? [],
    }));

  return NextResponse.json({ success: true, data: items });
}
