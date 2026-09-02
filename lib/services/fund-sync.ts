import { db } from '@/lib/supabase/admin';
import { getSECApiClient } from '@/lib/sec-api/client';
import Anthropic from '@anthropic-ai/sdk';

async function generateThesis(
  fundName: string,
  holdings: { ticker: string; weight: number; name?: string }[],
  quarter: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return '';
  const top = holdings.slice(0, 20);
  // Include the issuer name from the filing. Given bare tickers, the model cannot
  // identify recently-listed or thinly-covered names and says so — which then ends
  // up quoted in Ed's context as "this data looks fictional".
  const holdingsList = top
    .map((h, i) => `${i + 1}. ${h.name ? `${h.name} (${h.ticker})` : h.ticker} — ${h.weight.toFixed(1)}%`)
    .join('\n');
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
 * Sync the global fund universe (user_id IS NULL). Pass a userId only to sync a
 * legacy per-user set; the universe is shared and should not be synced per user.
 */
export async function syncAllFunds(userId?: string): Promise<SyncResult[]> {
  let query = db.from('funds').select('*').eq('enabled', true);
  query = userId ? query.eq('user_id', userId) : query.is('user_id', null);
  const { data: enabledFunds } = await query;
  const results: SyncResult[] = [];
  for (const fund of (enabledFunds ?? [])) {
    results.push(await syncFund(fund.cik, fund.user_id ?? undefined));
  }
  return results;
}

export async function syncFund(cik: string, userId?: string, quarter?: string): Promise<SyncResult> {
  const secClient = getSECApiClient();

  let fundQuery = db.from('funds').select('*').eq('cik', cik);
  fundQuery = userId ? fundQuery.eq('user_id', userId) : fundQuery.is('user_id', null);
  const { data: fund } = await fundQuery.maybeSingle();
  if (!fund) {
    return { fundId: '', cik, name: '', success: false, holdingsCount: 0, error: `Fund ${cik} not found` };
  }

  try {
    const holdingsData = await secClient.fetch13FHoldings(cik, quarter);

    let del = db.from('holdings').delete().eq('fund_id', fund.id).eq('quarter', holdingsData.quarter);
    del = userId ? del.eq('user_id', userId) : del.is('user_id', null);
    await del;

    // holdings is UNIQUE(fund_id, ticker, quarter), but positions are deduped on
    // CUSIP — so two share classes or a stock plus its warrant can arrive with
    // one ticker and different CUSIPs. Collapse them here or the whole batch is
    // rejected. The first CUSIP wins as the row's identity.
    const byTicker = new Map<string, typeof holdingsData.holdings[number]>();
    for (const h of holdingsData.holdings) {
      const existing = byTicker.get(h.ticker);
      if (existing) {
        existing.shares += h.shares;
        existing.value += h.value;
        existing.weight += h.weight;
      } else {
        byTicker.set(h.ticker, { ...h });
      }
    }
    const rows = [...byTicker.values()];

    if (rows.length > 0) {
      const { error: insertError } = await db.from('holdings').insert(
        rows.map(h => ({
          fund_id: fund.id,
          user_id: userId ?? null,
          ticker: h.ticker,
          cusip: h.cusip ?? null,
          issuer_name: h.name ?? null,
          shares: h.shares,
          value: h.value,
          weight: h.weight,
          quarter: holdingsData.quarter,
          period_end: holdingsData.periodEnd,
          filing_date: new Date(holdingsData.filingDate).toISOString(),
        }))
      );
      // Never swallow this. Reporting a fetch count as if it were a write count
      // is how 12 funds ended up silently missing a quarter.
      if (insertError) {
        return {
          fundId: fund.id, cik, name: fund.name, success: false, holdingsCount: 0,
          quarter: holdingsData.quarter,
          error: `Insert failed: ${insertError.message}`,
        };
      }
    }

    // Only regenerate the thesis for the fund's current filing. A historical
    // backfill must not replace the latest thesis with an older quarter's.
    if (!quarter) {
      await db.from('fund_theses').delete().eq('fund_id', fund.id);
      const thesisText = await generateThesis(fund.name, holdingsData.holdings, holdingsData.quarter);
      if (thesisText) {
        await db.from('fund_theses').insert({ fund_id: fund.id, thesis: thesisText, quarter: holdingsData.quarter });
      }
    }

    return { fundId: fund.id, cik, name: fund.name, success: true, holdingsCount: rows.length, quarter: holdingsData.quarter };
  } catch (error: any) {
    return { fundId: fund.id, cik, name: fund.name, success: false, holdingsCount: 0, error: error.message };
  }
}
