import { db } from '@/lib/supabase/admin';

export interface CompanyRecommendation {
  ticker: string;
  score: number;
  fundCount: number;
  aggregateWeight: number;
  averageWeight: number;
  totalValue: number;
  recentAdditions: number;
  reasons: string[];
}

// Known bond/fixed-income ETFs and money-market instruments to exclude
const BOND_ETF_EXCLUSIONS = new Set([
  'SHY','IEF','TLT','GOVT','BND','AGG','LQD','HYG','JNK','VCSH','VCIT','VGSH','VGIT','VGLT',
  'MUB','TIP','VTIP','SCHZ','SCHO','SCHR','SCHB','BNDX','EMB','IGIB','IGSB','USHY',
  'FLOT','NEAR','BSV','BIV','BLV','BSCO','BSCP','BSCQ','GSY','MINT','SHV','ICSH',
  'JPST','PIMIX','PONAX','GLD','IAU','SLV','PDBC','DJP', 'SGOL',
]);

async function getLatestQuarter(userId: string): Promise<string> {
  const { data: funds } = await db.from('funds').select('id').eq('user_id', userId).eq('enabled', true);
  const fundIds = (funds ?? []).map(f => f.id);
  if (!fundIds.length) return getCurrentQuarter();
  const { data } = await db.from('holdings').select('quarter').in('fund_id', fundIds).order('quarter', { ascending: false }).limit(1).maybeSingle();
  return data?.quarter || getCurrentQuarter();
}

async function getPreviousQuarter(userId: string): Promise<string> {
  const latest = await getLatestQuarter(userId);
  const [year, q] = latest.split('-Q');
  const qNum = parseInt(q);
  return qNum === 1 ? `${parseInt(year) - 1}-Q4` : `${year}-Q${qNum - 1}`;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month <= 3) return `${year}-Q1`;
  if (month <= 6) return `${year}-Q2`;
  if (month <= 9) return `${year}-Q3`;
  return `${year}-Q4`;
}

export async function analyzeDiversification(userId: string) {
  const quarter = await getLatestQuarter(userId);
  const { data: funds } = await db.from('funds').select('id, name').eq('user_id', userId).eq('enabled', true);
  if (!funds?.length) return new Map();

  const { data: holdings } = await db.from('holdings').select('ticker, value, weight, fund_id').in('fund_id', funds.map(f => f.id)).eq('quarter', quarter);

  const fundNameMap = new Map(funds.map(f => [f.id, f.name]));
  const tickerMap = new Map<string, { fundCount: number; totalValue: number; totalWeight: number; funds: string[] }>();

  for (const h of (holdings ?? [])) {
    const fundName = fundNameMap.get(h.fund_id) ?? '';
    const existing = tickerMap.get(h.ticker) || { fundCount: 0, totalValue: 0, totalWeight: 0, funds: [] };
    if (!existing.funds.includes(fundName)) { existing.fundCount++; existing.funds.push(fundName); }
    existing.totalValue += h.value;
    existing.totalWeight += h.weight;
    tickerMap.set(h.ticker, existing);
  }

  return tickerMap;
}

export async function scoreCompanies(userId: string, limit = 20): Promise<CompanyRecommendation[]> {
  const [diversification, { data: funds }, previousQuarter] = await Promise.all([
    analyzeDiversification(userId),
    db.from('funds').select('id').eq('user_id', userId).eq('enabled', true),
    getPreviousQuarter(userId),
  ]);

  const fundCount = funds?.length ?? 0;
  if (fundCount === 0) return [];

  const latestQuarter = await getLatestQuarter(userId);
  const fundIds = (funds ?? []).map(f => f.id);

  // Previous quarter holdings — only for funds that actually had data then
  const { data: previousHoldings } = await db.from('holdings').select('ticker, fund_id').in('fund_id', fundIds).eq('quarter', previousQuarter);
  const previousTickerSet = new Set((previousHoldings ?? []).map(h => `${h.fund_id}-${h.ticker}`));
  // Track which funds had any previous quarter data
  const fundsWithPreviousData = new Set((previousHoldings ?? []).map(h => h.fund_id));

  const { data: currentHoldings } = await db.from('holdings').select('ticker, fund_id').in('fund_id', fundIds).eq('quarter', latestQuarter);
  const currentByTicker = new Map<string, string[]>();
  for (const h of (currentHoldings ?? [])) {
    currentByTicker.set(h.ticker, [...(currentByTicker.get(h.ticker) ?? []), h.fund_id]);
  }

  // Only plain equity tickers: 1-5 uppercase letters, optional dot + 1-2 letters (e.g. BRK.A)
  const equityTicker = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

  const recommendations: CompanyRecommendation[] = [];

  for (const [ticker, data] of diversification.entries()) {
    if (!equityTicker.test(ticker)) continue;
    if (BOND_ETF_EXCLUSIONS.has(ticker)) continue;

    // Only count as "newly added" for funds that had previous-quarter data — avoids inflating
    // scores for all holdings when a fund is freshly imported with no historical baseline.
    const recentAdditions = (currentByTicker.get(ticker) ?? []).filter(
      fid => fundsWithPreviousData.has(fid) && !previousTickerSet.has(`${fid}-${ticker}`)
    ).length;

    const score = (data.fundCount / fundCount) * 100 * 0.4 + data.totalWeight * 0.4 + recentAdditions * 20 * 0.2;
    const reasons: string[] = [];
    if (data.fundCount >= fundCount * 0.5) reasons.push(`Held by ${data.fundCount} of ${fundCount} funds`);
    if (data.totalWeight > 5) reasons.push(`High aggregate weight (${data.totalWeight.toFixed(2)}%)`);
    if (recentAdditions > 0) reasons.push(`Recently added by ${recentAdditions} fund(s)`);
    recommendations.push({ ticker, score, fundCount: data.fundCount, aggregateWeight: data.totalWeight, averageWeight: data.totalWeight / data.fundCount, totalValue: data.totalValue, recentAdditions, reasons });
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getRecommendations(userId: string, limit = 20, minFundCount?: number, minWeight?: number): Promise<CompanyRecommendation[]> {
  let recs = await scoreCompanies(userId, limit * 2);
  if (minFundCount !== undefined) recs = recs.filter(r => r.fundCount >= minFundCount);
  if (minWeight !== undefined) recs = recs.filter(r => r.aggregateWeight >= minWeight);
  return recs.slice(0, limit);
}
