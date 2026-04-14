import { prisma } from '@/lib/prisma';
import { getSECApiClient } from '@/lib/sec-api/client';

export interface SyncResult {
  fundId: string;
  cik: string;
  name: string;
  success: boolean;
  holdingsCount: number;
  quarter?: string;
  error?: string;
}

/**
 * Sync all enabled funds from the database.
 */
export async function syncAllFunds(): Promise<SyncResult[]> {
  const enabledFunds = await prisma.fund.findMany({ where: { enabled: true } });
  const results: SyncResult[] = [];

  for (const fund of enabledFunds) {
    const result = await syncFund(fund.cik);
    results.push(result);
  }

  return results;
}

/**
 * Sync a specific fund by CIK. Creates the fund record if it doesn't exist.
 */
export async function syncFund(cik: string): Promise<SyncResult> {
  const secClient = getSECApiClient();

  let fund = await prisma.fund.findUnique({ where: { cik } });

  if (!fund) {
    // If not in DB, we can't create it without a name – caller should create first
    return { fundId: '', cik, name: '', success: false, holdingsCount: 0, error: `Fund ${cik} not found in database` };
  }

  try {
    const holdingsData = await secClient.fetch13FHoldings(cik);

    // Replace all holdings for this quarter
    await prisma.holding.deleteMany({
      where: { fundId: fund.id, quarter: holdingsData.quarter },
    });

    if (holdingsData.holdings.length > 0) {
      await prisma.holding.createMany({
        data: holdingsData.holdings.map(h => ({
          fundId: fund!.id,
          ticker: h.ticker,
          shares: h.shares,
          value: h.value,
          weight: h.weight,
          quarter: holdingsData.quarter,
          filingDate: new Date(holdingsData.filingDate),
        })),
      });
    }

    return {
      fundId: fund.id,
      cik,
      name: fund.name,
      success: true,
      holdingsCount: holdingsData.holdings.length,
      quarter: holdingsData.quarter,
    };
  } catch (error: any) {
    return {
      fundId: fund.id,
      cik,
      name: fund.name,
      success: false,
      holdingsCount: 0,
      error: error.message,
    };
  }
}
