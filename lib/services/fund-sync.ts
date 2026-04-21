import { prisma } from '@/lib/prisma';
import { getSECApiClient } from '@/lib/sec-api/client';
import Anthropic from '@anthropic-ai/sdk';

async function generateThesis(fundName: string, holdings: { ticker: string; weight: number }[], quarter: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return '';
  const top = holdings.slice(0, 20);
  const holdingsList = top.map((h, i) => `${i + 1}. ${h.ticker} (${h.weight.toFixed(1)}%)`).join('\n');
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      messages: [{
        role: 'user',
        content: `Look at these stock holdings from "${fundName}" as of ${quarter}. Write 4-5 sentences explaining what kinds of companies this fund bets on and why — pitched at a smart high schooler who knows nothing about finance. Describe what the actual companies do in plain terms (make chips, run cloud servers, sell insurance, etc.), what the common thread is across the holdings, and what big trend or belief seems to be driving the bets. Be specific — name actual companies or industries where it helps. No buzzwords like "diversified", "exposure", "portfolio", "thesis", "positioned", "leverage", or "sectors". No markdown, headers, or hashtags — plain text only.\n\nHoldings:\n${holdingsList}`,
      }],
    });
    return (msg.content[0] as { type: string; text: string }).text.trim();
  } catch { return ''; }
}

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

    // Clear old thesis and regenerate from new holdings
    await prisma.fundThesis.deleteMany({ where: { fundId: fund.id } });
    const thesisText = await generateThesis(fund.name, holdingsData.holdings, holdingsData.quarter);
    if (thesisText) {
      await prisma.fundThesis.create({ data: { fundId: fund.id, thesis: thesisText, quarter: holdingsData.quarter } });
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
