import { NextResponse } from 'next/server';
import { getSECApiClient } from '@/lib/sec-api/client';

/** GET /api/sec/lookup?cik=1067983 — validate a CIK and return company name */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cik = searchParams.get('cik')?.trim();

  if (!cik || !/^\d+$/.test(cik)) {
    return NextResponse.json({ success: false, error: 'Invalid CIK (must be numeric)' }, { status: 400 });
  }

  try {
    const client = getSECApiClient();
    const company = await client.lookupCompany(cik);
    return NextResponse.json({ success: true, data: company });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message?.includes('404') ? 'CIK not found' : error.message },
      { status: 404 },
    );
  }
}
