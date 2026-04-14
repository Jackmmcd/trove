import { syncAllFunds } from '@/lib/services/fund-sync';

/**
 * Daily sync job to check for new 13F filings and update portfolio data
 * This can be called via API route or scheduled task
 */
export async function dailySync() {
  console.log('Starting daily fund sync...');
  
  try {
    const results = await syncAllFunds();
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`Sync completed: ${successCount} successful, ${failureCount} failed`);
    
    return {
      success: true,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
      },
    };
  } catch (error: any) {
    console.error('Error in daily sync:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}



