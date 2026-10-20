import { NextResponse } from 'next/server';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';
import { AlpacaClient } from '@/lib/alpaca/client';
import { requireSignedIn } from '@/lib/broker/guard';
import { sessionCloses } from '@/lib/market/close';
import axios from 'axios';

/**
 * GET /api/tastytrade/quotes?symbols=AAPL,MSFT,AMZN
 *
 * `basis=close` returns the last completed session's close rather than a live
 * mark — what the portfolio is valued at, so the numbers hold still between
 * refreshes and stay on Friday's close all weekend. Order tickets leave it off
 * and get the live price they are actually trading against.
 */
export async function GET(request: Request) {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ success: false, error: 'No symbols provided' }, { status: 400 });
  }

  if (searchParams.get('basis') === 'close') {
    try {
      const closes = await sessionCloses(symbols);
      const prices: Record<string, number> = {};
      const prevCloses: Record<string, number> = {};
      const asOf: Record<string, string> = {};
      for (const [symbol, c] of Object.entries(closes)) {
        prices[symbol] = c.close;
        prevCloses[symbol] = c.prevClose;
        asOf[symbol] = c.closeDate;
      }
      return NextResponse.json({ success: true, data: prices, prevCloses, asOf, source: 'close' });
    } catch (error: any) {
      console.error('Session close lookup failed:', error.message);
      return NextResponse.json({ success: false, error: 'Failed to fetch closing prices' }, { status: 500 });
    }
  }

  // Alpaca mode: use Alpaca market data, fall through to Yahoo on failure
  if (process.env.BROKER === 'alpaca') {
    try {
      const client = new AlpacaClient();
      const prices = await client.getQuotes(symbols);
      if (Object.keys(prices).length > 0) {
        const { prevCloses } = await fetchYahooQuotes(symbols);
        return NextResponse.json({ success: true, data: prices, prevCloses, source: 'alpaca' });
      }
    } catch {
      // Fall through to Yahoo Finance
    }
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
        const { prevCloses } = await fetchYahooQuotes(symbols);
        return NextResponse.json({ success: true, data: prices, prevCloses, source: 'tastytrade' });
      }
    }
  } catch {
    // Fall through to Yahoo Finance
  }

  // Fallback: Yahoo Finance v8 chart API (free, no auth)
  try {
    const { prices, prevCloses } = await fetchYahooQuotes(symbols);
    return NextResponse.json({ success: true, data: prices, prevCloses, source: 'yahoo' });
  } catch (error: any) {
    console.error('Quotes fallback error:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to fetch quotes' }, { status: 500 });
  }
}

async function fetchYahooQuotes(symbols: string[]): Promise<{ prices: Record<string, number>; prevCloses: Record<string, number> }> {
  const prices: Record<string, number> = {};
  const prevCloses: Record<string, number> = {};

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
        const meta = res.data?.chart?.result?.[0]?.meta ?? {};
        const price: number = meta.regularMarketPrice ?? 0;
        const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? 0;
        return { symbol, price, prevClose };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.price > 0) prices[r.value.symbol] = r.value.price;
        if (r.value.prevClose > 0) prevCloses[r.value.symbol] = r.value.prevClose;
      }
    }
  }

  return { prices, prevCloses };
}
