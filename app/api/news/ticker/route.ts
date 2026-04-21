import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return NextResponse.json({ success: false, error: 'Missing ticker' }, { status: 400 });

  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: { q: ticker, quotesCount: 0, newsCount: 20 },
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      timeout: 8000,
    });

    const items = (res.data?.news ?? []).map((n: any) => ({
      uuid: n.uuid,
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: n.providerPublishTime,
      relatedTickers: n.relatedTickers ?? [],
    }));

    return NextResponse.json({ success: true, data: items });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
