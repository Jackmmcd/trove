import { NextResponse } from 'next/server';
import axios from 'axios';

/** GET /api/tastytrade/history?symbols=QQQ,AAPL
 *  Returns { symbol: { prev1Close, prev5Close } } for daily/weekly P&L calculation.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ success: false, error: 'No symbols' }, { status: 400 });

  const results = await Promise.allSettled(
    symbols.map(async symbol => {
      const res = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
        {
          params: { interval: '1d', range: '7d' },
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
          timeout: 8000,
        }
      );
      const result = res.data?.chart?.result?.[0];
      const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
      const validCloses = closes.filter((c: number) => c != null && c > 0);
      // prev1Close = yesterday (second to last), prev5Close = ~1 week ago (first of 7d range)
      const prev1Close = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null;
      const prev5Close = validCloses.length >= 5 ? validCloses[validCloses.length - 5] : (validCloses[0] ?? null);
      return { symbol, prev1Close, prev5Close };
    })
  );

  const data: Record<string, { prev1Close: number | null; prev5Close: number | null }> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      data[r.value.symbol] = { prev1Close: r.value.prev1Close, prev5Close: r.value.prev5Close };
    }
  }

  return NextResponse.json({ success: true, data });
}
