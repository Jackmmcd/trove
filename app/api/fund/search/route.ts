import { NextResponse } from 'next/server';
import { hybridFundSearch } from '@/lib/funds/embeddings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fund/search?q=funds betting on AI chips
 *
 * Name and manager matches from the directory, plus funds whose portfolios are
 * semantically closest to the query. `semantic: false` means only the keyword
 * half answered (migration not applied, or Voyage unreachable).
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!q) return NextResponse.json({ results: [], semantic: false });
  return NextResponse.json(await hybridFundSearch(q.slice(0, 200)));
}
