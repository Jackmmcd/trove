import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { db } from '@/lib/supabase/admin';

/**
 * Tool definitions and handlers.
 *
 * The array below is part of the cached prefix — it is a module constant so the
 * order and text are byte-identical on every request. Do not build it per call,
 * do not sort it dynamically, and do not interpolate anything into a description.
 */

export const ED_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_fund_detail',
    description:
      'Full position list for one fund, beyond the 25 largest already shown. Use when the user asks about a fund\'s smaller positions, its full book, or an older quarter.',
    input_schema: {
      type: 'object',
      properties: {
        cik: { type: 'string', description: 'Zero-padded 10-digit CIK, exactly as shown for that fund.' },
        quarter: { type: 'string', description: 'Optional, e.g. "2026-Q2". Defaults to the fund\'s latest filing.' },
      },
      required: ['cik'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_ticker_holders',
    description:
      'Every fund Trove tracks that holds a given ticker, with weight, value, and the quarter each position was first reported. Use to check how broad a name\'s support is, or when a fund first disclosed it.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Equity ticker, uppercase.' },
      },
      required: ['ticker'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_stock_analysis',
    description:
      'What a company actually does, plus the case for and against owning it. Use whenever the user asks about a specific company, or when you name a company they are unlikely to recognise. Results are cached after the first lookup.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Equity ticker, uppercase.' },
      },
      required: ['ticker'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_user_portfolio',
    description:
      'The user\'s current Trove paper positions with cost basis and cash. Use before commenting on overlap, concentration, or what they already own.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
];

// Mirrors app/api/stock/analysis/route.ts so a company reads the same way in
// Ed as it does on its stock page.
const STOCK_ANALYSIS_SYSTEM = `You are a sharp equity analyst. Given a company description, output three things in plain English — no jargon, no filler.

Rules:
- Summary: 1–2 sentences max. Explain what the company does and how it makes money, as if explaining to a smart teenager.
- Bull Case: exactly 3 bullets, each under 15 words. Real macro tailwinds specific to this company.
- Bear Case: exactly 3 bullets, each under 15 words. Specific structural risks, not generic ones.
- Every bullet must be a cause → effect statement. No vague claims.

Format exactly:

Summary:
<sentences>

Bull Case:
- <point>
- <point>
- <point>

Bear Case:
- <point>
- <point>
- <point>`;

function prevQuarter(q: string): string {
  const [y, n] = q.split('-Q');
  const qn = parseInt(n, 10);
  return qn === 1 ? `${parseInt(y, 10) - 1}-Q4` : `${y}-Q${qn - 1}`;
}

async function getFundDetail(cik: string, quarter?: string) {
  const { data: fund } = await db
    .from('funds')
    .select('id, name, cik, entity_type, filer_note')
    .eq('cik', cik).is('user_id', null).maybeSingle();
  if (!fund) return { error: `Trove does not track a fund with CIK ${cik}.` };

  const { data: all } = await db
    .from('holdings')
    .select('ticker, shares, value, weight, quarter, period_end')
    .eq('fund_id', fund.id);

  const rows = all ?? [];
  if (!rows.length) return { error: `${fund.name} has no holdings on record yet.` };

  const target = quarter ?? rows.map(r => r.quarter).sort().reverse()[0];
  const current = rows.filter(r => r.quarter === target).sort((a, b) => b.value - a.value);
  if (!current.length) {
    return { error: `${fund.name} has no filing for ${target}. Available: ${[...new Set(rows.map(r => r.quarter))].sort().join(', ')}` };
  }

  const prior = rows.filter(r => r.quarter === prevQuarter(target));
  const priorWeight = new Map(prior.map(r => [r.ticker, r.weight]));

  return {
    fund: fund.name,
    entity_type: fund.entity_type,
    note: fund.filer_note || undefined,
    quarter: target,
    period_end: current[0]?.period_end ?? null,
    has_prior_quarter: prior.length > 0,
    position_count: current.length,
    total_value: current.reduce((s, r) => s + r.value, 0),
    positions: current.map(r => ({
      ticker: r.ticker,
      weight: Number(r.weight.toFixed(2)),
      value: Math.round(r.value),
      change: prior.length === 0 ? null
        : priorWeight.has(r.ticker) ? Number((r.weight - priorWeight.get(r.ticker)!).toFixed(2)) : 'NEW',
    })),
  };
}

async function getTickerHolders(ticker: string) {
  const sym = ticker.toUpperCase().trim();
  const { data: funds } = await db
    .from('funds').select('id, name, cik, entity_type').is('user_id', null).eq('enabled', true);
  const fundMap = new Map((funds ?? []).map(f => [f.id, f]));

  const { data: rows } = await db
    .from('holdings')
    .select('fund_id, weight, value, quarter')
    .eq('ticker', sym)
    .in('fund_id', [...fundMap.keys()]);

  if (!rows?.length) return { ticker: sym, holders: [], note: 'No tracked fund reports this ticker.' };

  const byFund = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byFund.has(r.fund_id)) byFund.set(r.fund_id, []);
    byFund.get(r.fund_id)!.push(r);
  }

  const holders = [...byFund.entries()].map(([fundId, hs]) => {
    const fund = fundMap.get(fundId)!;
    const latest = hs.sort((a, b) => b.quarter.localeCompare(a.quarter))[0];
    const firstSeen = hs.map(h => h.quarter).sort()[0];
    return {
      fund: fund.name,
      entity_type: fund.entity_type,
      quarter: latest.quarter,
      weight: Number(latest.weight.toFixed(2)),
      value: Math.round(latest.value),
      first_reported: firstSeen,
    };
  }).sort((a, b) => b.weight - a.weight);

  return {
    ticker: sym,
    holder_count: holders.length,
    funds_tracked: fundMap.size,
    aggregate_weight: Number(holders.reduce((s, h) => s + h.weight, 0).toFixed(2)),
    holders,
  };
}

/**
 * Company synopsis plus bull/bear case.
 *
 * Reuses the stock_analyses cache the stock pages already populate, so a name
 * looked up here is available there and vice versa. On a miss it generates the
 * analysis the same way /api/stock/analysis does — Haiku is the right tier for
 * a short structured summary, and it keeps this off the Opus bill.
 */
function money(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v)}`;
}

/**
 * Fresh day-end market cap and TTM figures for one company.
 *
 * The corpus carries cached market caps so every position has a rough size, but
 * when someone asks about a specific company we re-fetch: the cached value can
 * be a week old, and a stale cap is exactly the kind of number that sounds
 * authoritative and is wrong. The fresh value is written back to the cache.
 */
async function liveFundamentals(sym: string) {
  try {
    const { getTickerDetails } = await import('@/lib/polygon/client');
    const d = await getTickerDetails(sym);
    if (!d) return null;

    const out = {
      name: d.name ?? sym,
      sector: d.sic_description ?? null,
      market_cap: d.market_cap ?? null,
      market_cap_display: d.market_cap ? money(d.market_cap) : null,
      shares_outstanding: d.share_class_shares_outstanding ?? d.weighted_shares_outstanding ?? null,
      employees: d.total_employees ?? null,
      listed: d.list_date ?? null,
      as_of: 'day-end, fetched just now',
    };

    // Writing back to the cache is a bonus, not the point. If it fails the
    // figures we already fetched are still good — returning null here would
    // discard a live market cap because a cache write went wrong.
    try {
      const { error } = await db.from('security_fundamentals').upsert({
        ticker: sym,
        name: out.name,
        sector: out.sector,
        market_cap: out.market_cap,
        shares_outstanding: out.shares_outstanding,
        employees: out.employees,
        list_date: out.listed,
        homepage: d.homepage_url ?? null,
        status: 'ok',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ticker' });
      if (error) console.error('security_fundamentals upsert:', error.message);
    } catch (e) {
      console.error('security_fundamentals upsert threw:', e);
    }

    return out;
  } catch { return null; }
}

async function getStockAnalysis(ticker: string) {
  const sym = ticker.toUpperCase().trim();

  // Fundamentals are always fetched fresh; only the written analysis is cached.
  const [{ data: cached }, fundamentals] = await Promise.all([
    db.from('stock_analyses').select('*').eq('ticker', sym).maybeSingle(),
    liveFundamentals(sym),
  ]);

  if (cached?.summary) {
    return {
      ticker: sym,
      summary: cached.summary,
      bull_case: cached.bull_case,
      bear_case: cached.bear_case,
      fundamentals,
      source: 'cached analysis, live fundamentals',
    };
  }

  // Polygon first. Yahoo's quoteSummary now returns 401 (v10) / 404 (v11) for
  // unauthenticated callers, so the Yahoo path in the stock route is dead and
  // silently falls through to Polygon anyway — this just does it directly.
  let name = fundamentals?.name ?? sym;
  let sector: string | null = fundamentals?.sector ?? null;
  let description = '';
  try {
    const { getTickerDetails } = await import('@/lib/polygon/client');
    const d = await getTickerDetails(sym);
    description = d?.description ?? '';
  } catch { /* fall through to Yahoo */ }

  if (!description) {
    try {
      const res = await axios.get(
        `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(sym)}`,
        {
          params: { modules: 'assetProfile,price' },
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
          timeout: 8000,
        },
      );
      const r = res.data?.quoteSummary?.result?.[0] ?? {};
      description = r.assetProfile?.longBusinessSummary ?? '';
      sector = sector ?? r.assetProfile?.sector ?? null;
      if (name === sym) name = r.price?.longName ?? r.price?.shortName ?? sym;
    } catch { /* handled below */ }
  }

  if (!description) {
    return {
      ticker: sym,
      error: `Could not retrieve a business description for ${sym} — the profile lookup failed. Do not describe what this company does; say the lookup did not return, and answer from the filings only.`,
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ticker: sym, name, sector, fundamentals, description: description.slice(0, 1200) };

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: STOCK_ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: `Ticker: ${sym}\n\nDescription: ${description}` }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '';

    const summary = text.match(/Summary:\s*([\s\S]*?)(?=Bull Case:|$)/i)?.[1]?.trim() ?? '';
    const bull = text.match(/Bull Case:\s*([\s\S]*?)(?=Bear Case:|$)/i)?.[1]?.trim() ?? '';
    const bear = text.match(/Bear Case:\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '';

    if (summary) {
      await db.from('stock_analyses').upsert(
        { ticker: sym, summary, bull_case: bull, bear_case: bear },
        { onConflict: 'ticker' },
      );
    }
    return { ticker: sym, name, sector, fundamentals, summary, bull_case: bull, bear_case: bear, source: 'generated' };
  } catch {
    return { ticker: sym, name, sector, fundamentals, description: description.slice(0, 1200) };
  }
}

async function getUserPortfolio(userId: string) {
  const [{ data: account }, { data: positions }] = await Promise.all([
    db.from('paper_accounts').select('cash').eq('user_id', userId).maybeSingle(),
    db.from('paper_positions').select('symbol, quantity, avg_open_price').eq('user_id', userId),
  ]);

  const rows = positions ?? [];
  const valued = rows.map(p => ({
    ticker: p.symbol,
    shares: p.quantity,
    cost_basis: Number((p.quantity * p.avg_open_price).toFixed(2)),
  }));
  const equity = valued.reduce((s, p) => s + p.cost_basis, 0);

  return {
    cash: Number((account?.cash ?? 0).toFixed(2)),
    equity_at_cost: Number(equity.toFixed(2)),
    position_count: valued.length,
    positions: valued
      .map(p => ({ ...p, weight: equity > 0 ? Number(((p.cost_basis / equity) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.cost_basis - a.cost_basis),
    note: 'Values are cost basis, not live market prices.',
  };
}

export async function runTool(name: string, input: any, userId: string): Promise<unknown> {
  switch (name) {
    case 'get_fund_detail':     return getFundDetail(input.cik, input.quarter);
    case 'get_ticker_holders':  return getTickerHolders(input.ticker);
    case 'get_stock_analysis':  return getStockAnalysis(input.ticker);
    case 'get_user_portfolio':  return getUserPortfolio(userId);
    default:                    return { error: `Unknown tool: ${name}` };
  }
}
