import { NextResponse } from 'next/server';
import { getSECApiClient } from '@/lib/sec-api/client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cik: string }> }
) {
  try {
    const { cik } = await params;
    const { searchParams } = new URL(request.url);
    const quarter = searchParams.get('quarter') || undefined;
    
    const client = getSECApiClient();
    const holdings = await client.fetch13FHoldings(cik, quarter);
    
    return NextResponse.json({
      success: true,
      data: holdings,
    });
  } catch (error: any) {
    console.error('Error fetching fund holdings:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch fund holdings',
      },
      { status: 500 }
    );
  }
}

