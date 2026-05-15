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

async function getLatestQuarter(): Promise<string> {
  const { data } = await db.from('holdings').select('quarter').order('quarter', { ascending: false }).limit(1).maybeSingle();
  return data?.quarter || getCurrentQuarter();
}

async function getPreviousQuarter(): Promise<string> {
  const latest = await getLatestQuarter();
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

export async function analyzeDiversification() {
  const quarter = await getLatestQuarter();
  const { data: funds } = await db.from('funds').select('id, name').eq('enabled', true);
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

export async function scoreCompanies(limit = 20): Promise<CompanyRecommendation[]> {
  const [diversification, { data: funds }, previousQuarter] = await Promise.all([
    analyzeDiversification(),
    db.from('funds').select('id').eq('enabled', true),
    getPreviousQuarter(),
  ]);

  const fundCount = funds?.length ?? 0;
  const latestQuarter = await getLatestQuarter();

  const { data: previousHoldings } = await db.from('holdings').select('ticker, fund_id').eq('quarter', previousQuarter);
  const previousTickerSet = new Set((previousHoldings ?? []).map(h => `${h.fund_id}-${h.ticker}`));

  const { data: currentHoldings } = await db.from('holdings').select('ticker, fund_id').eq('quarter', latestQuarter);
  const currentByTicker = new Map<string, string[]>();
  for (const h of (currentHoldings ?? [])) {
    currentByTicker.set(h.ticker, [...(currentByTicker.get(h.ticker) ?? []), h.fund_id]);
  }

  // Only plain equity tickers: 1-5 uppercase letters, optional dot + 1-2 letters (e.g. BRK.A)
  // Excludes bond/note descriptions like "BABA 0.5 06/01/31"
  const equityTicker = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

  const recommendations: CompanyRecommendation[] = [];

  for (const [ticker, data] of diversification.entries()) {
    if (!equityTicker.test(ticker)) continue;
    const recentAdditions = (currentByTicker.get(ticker) ?? []).filter(fid => !previousTickerSet.has(`${fid}-${ticker}`)).length;
    const score = (data.fundCount / fundCount) * 100 * 0.4 + data.totalWeight * 0.4 + recentAdditions * 20 * 0.2;
    const reasons: string[] = [];
    if (data.fundCount >= fundCount * 0.5) reasons.push(`Held by ${data.fundCount} of ${fundCount} funds`);
    if (data.totalWeight > 5) reasons.push(`High aggregate weight (${data.totalWeight.toFixed(2)}%)`);
    if (recentAdditions > 0) reasons.push(`Recently added by ${recentAdditions} fund(s)`);
    recommendations.push({ ticker, score, fundCount: data.fundCount, aggregateWeight: data.totalWeight, averageWeight: data.totalWeight / data.fundCount, totalValue: data.totalValue, recentAdditions, reasons });
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getRecommendations(limit = 20, minFundCount?: number, minWeight?: number): Promise<CompanyRecommendation[]> {
  let recs = await scoreCompanies(limit * 2);
  if (minFundCount !== undefined) recs = recs.filter(r => r.fundCount >= minFundCount);
  if (minWeight !== undefined) recs = recs.filter(r => r.aggregateWeight >= minWeight);
  return recs.slice(0, limit);
}
