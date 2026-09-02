import { NextResponse } from 'next/server';
import { dailySync } from '@/lib/cron/sync-funds';

/**
 * Cron endpoint for daily fund sync
 * Can be called by:
 * - Vercel Cron Jobs
 * - External cron service (cron-job.org, etc.)
 * - Manual trigger
 * 
 * Add authentication in production to prevent unauthorized access
 */
export async function GET(request: Request) {
  // Optional: Add authentication check
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // ?cik=0001040273 syncs a single global fund — used by scripts/sync-universe.js
    // so a 27-fund backfill can be resumed one filer at a time.
    const params = new URL(request.url, 'http://localhost').searchParams;
    const cik = params.get('cik');
    if (cik) {
      const { syncFund } = await import('@/lib/services/fund-sync');
      // &quarter=2026-Q1 backfills a historical filing so quarter-over-quarter
      // deltas can be computed. Without at least two quarters per fund, every
      // position reads as unchanged and the "new position" signal is dead.
      const one = await syncFund(cik, undefined, params.get('quarter') ?? undefined);
      return NextResponse.json({ success: one.success, results: [one], error: one.error });
    }

    const result = await dailySync();

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error: any) {
    console.error('Error in cron sync:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync funds',
      },
      { status: 500 }
    );
  }
}

// Also allow POST for manual triggers — preserve the URL so ?cik= still works
export async function POST(request: Request) {
  return GET(request);
}



