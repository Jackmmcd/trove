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

// Also allow POST for manual triggers
export async function POST() {
  return GET(new Request(''));
}



