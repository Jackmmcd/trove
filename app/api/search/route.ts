import { NextRequest, NextResponse } from 'next/server';
import { searchTickers } from '@/lib/polygon/client';
import { searchFunds } from '@/lib/funds/directory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ results: [] });
  // Funds come from the local directory, so they cost nothing to include. They
  // lead when they match — "Buffett" or "Dalio" is never a ticker search — and
  // a weak prefix hit on a fund doesn't push real tickers out.
  const funds = searchFunds(q, 3)
    .filter(f => f.score >= 3)
    .map(f => ({ symbol: f.cik, name: f.name, type: 'fund' }));
  const tickers = await searchTickers(q, 5);
  return NextResponse.json({ results: [...funds, ...tickers] });
}
