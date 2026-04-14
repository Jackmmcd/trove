import { NextResponse } from 'next/server';
import axios from 'axios';

/** GET /api/company-info?ticker=NVDA */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ success: false, error: 'No ticker' }, { status: 400 });

  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: { q: ticker, quotesCount: 1, newsCount: 0 },
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 6000,
    });

    const quote = res.data?.quotes?.[0];
    if (!quote || quote.symbol !== ticker) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        name: quote.longname || quote.shortname || ticker,
        sector: quote.sectorDisp || quote.sector || null,
        industry: quote.industryDisp || quote.industry || null,
        exchange: quote.exchDisp || null,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch' }, { status: 500 });
  }
}
