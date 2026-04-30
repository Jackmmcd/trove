import { NextRequest, NextResponse } from 'next/server';
import { searchTickers } from '@/lib/polygon/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ results: [] });
  const results = await searchTickers(q, 5);
  return NextResponse.json({ results });
}
