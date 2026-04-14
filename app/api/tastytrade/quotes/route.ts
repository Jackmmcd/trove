import { NextResponse } from 'next/server';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';
import axios from 'axios';

/** GET /api/tastytrade/quotes?symbols=AAPL,MSFT,AMZN */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ success: false, error: 'No symbols provided' }, { status: 400 });
  }

  // Try Tastytrade first if authenticated
  try {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      const client = getTastytradeClient(accessToken);
      const chunks: string[][] = [];
      for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50));

      const prices: Record<string, number> = {};
      for (const chunk of chunks) {
        const chunkPrices = await client.getQuotes(chunk);
        Object.assign(prices, chunkPrices);
      }

      if (Object.keys(prices).length > 0) {
        return NextResponse.json({ success: true, data: prices, source: 'tastytrade' });
      }
    }
  } catch {
    // Fall through to Yahoo Finance
  }

  // Fallback: Yahoo Finance v8 chart API (free, no auth)
  try {
    const prices = await fetchYahooPrices(symbols);
    return NextResponse.json({ success: true, data: prices, source: 'yahoo' });
  } catch (error: any) {
    console.error('Quotes fallback error:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to fetch quotes' }, { status: 500 });
  }
}

async function fetchYahooPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // Fetch up to 20 symbols in parallel; Yahoo doesn't have a reliable batch endpoint
  const concurrency = 20;
  for (let i = 0; i < symbols.length; i += concurrency) {
    const chunk = symbols.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map(async symbol => {
        const res = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
          {
            params: { interval: '1d', range: '1d' },
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
            timeout: 8000,
          },
        );
        const price: number = res.data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
        return { symbol, price };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.price > 0) {
        prices[r.value.symbol] = r.value.price;
      }
    }
  }

  return prices;
}
