import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';

/**
 * Tool definitions and handlers.
 *
 * The array below is part of the cached prefix — it is a module constant so the
 * order and text are byte-identical on every request. Do not build it per call,
 * do not sort it dynamically, and do not interpolate anything into a description.
 */

export const ANALYST_TOOLS: Anthropic.Beta.BetaTool[] = [
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
    name: 'find_institutional_holders',
    description:
      'Institutions beyond the funds Trove tracks that reported this company in a recent 13F, searched directly against SEC EDGAR by CUSIP. Use when the user asks who owns a company generally, or who the largest institutional shareholders are. Returns which institutions disclosed a position, NOT how big each position is.',
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
// Analyst as it does on its stock page.
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

interface HolderRow {
  fund_id: string; ticker: string; weight: number; value: number;
  quarter: string; instrument_type: string | null; issuer_name: string | null;
}

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
  const fundIds = [...fundMap.keys()];

  // Resolve the ticker to an ISSUER first. Matching on ticker alone misses every
  // other instrument the same company issued — a query for ECHO finds EchoStar
  // common but not its 2030 notes, which a different fund holds at a larger
  // weight. That produced "no other fund holds it" about a company two funds own.
  // Falls back to ticker matching when the issuer column is absent, so this
  // keeps working before supabase-migration-issuer.sql has been applied —
  // degraded (it will miss a company's other instruments) rather than broken.
  let seed: { cusip6?: string | null; issuer_name?: string | null } | null = null;
  try {
    const { data, error } = await db
      .from('holdings').select('cusip6, issuer_name')
      .eq('ticker', sym).not('cusip6', 'is', null).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    seed = data;
  } catch {
    seed = null;
  }

  const cols = 'fund_id, ticker, weight, value, quarter, instrument_type, issuer_name';
  const byIssuer = async () => fetchAllRows<HolderRow>((from, to) =>
    db.from('holdings').select(cols).eq('cusip6', seed!.cusip6!).in('fund_id', fundIds).order('id').range(from, to));
  const byTicker = async () => fetchAllRows<HolderRow>((from, to) =>
    db.from('holdings').select(cols).eq('ticker', sym).in('fund_id', fundIds).order('id').range(from, to));

  let rows: HolderRow[];
  try {
    rows = seed?.cusip6 ? await byIssuer() : await byTicker();
  } catch {
    const legacy = await fetchAllRows<Omit<HolderRow, 'instrument_type'>>((from, to) =>
      db.from('holdings')
        .select('fund_id, ticker, weight, value, quarter, issuer_name')
        .eq('ticker', sym).in('fund_id', fundIds).order('id').range(from, to));
    rows = legacy.map(r => ({ ...r, instrument_type: null }));
  }

  if (!rows.length) return { ticker: sym, holders: [], note: 'No tracked fund reports this ticker.' };

  // One row per fund per instrument: a fund can hold both the stock and the bonds.
  const byKey = new Map<string, HolderRow[]>();
  for (const r of rows) {
    const k = `${r.fund_id}|${r.instrument_type ?? 'unknown'}|${r.ticker}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }

  const holders = [...byKey.values()].map(hs => {
    const fund = fundMap.get(hs[0].fund_id)!;
    const latest = [...hs].sort((a, b) => b.quarter.localeCompare(a.quarter))[0];
    return {
      fund: fund.name,
      entity_type: fund.entity_type,
      instrument: latest.instrument_type ?? 'unknown',
      reported_as: latest.ticker,
      quarter: latest.quarter,
      weight: Number(latest.weight.toFixed(2)),
      value: Math.round(latest.value),
      first_reported: hs.map(h => h.quarter).sort()[0],
    };
  }).sort((a, b) => b.weight - a.weight);

  const equityHolders = holders.filter(h => h.instrument === 'equity');
  const distinctFunds = new Set(holders.map(h => h.fund));

  return {
    ticker: sym,
    issuer: seed?.issuer_name ?? rows[0]?.issuer_name ?? null,
    fund_count: distinctFunds.size,
    equity_holder_count: new Set(equityHolders.map(h => h.fund)).size,
    funds_tracked: fundMap.size,
    // Only equity weights are comparable; summing a bond weight into an equity
    // total produces a number that means nothing.
    aggregate_equity_weight: Number(equityHolders.reduce((s, h) => s + h.weight, 0).toFixed(2)),
    note: holders.some(h => h.instrument !== 'equity')
      ? 'Some holders hold debt or warrants, not stock. Those are different bets — say which is which.'
      : undefined,
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
    const { getTickerDetails, getPrevClose } = await import('@/lib/polygon/client');

    // Polygon allows 5 requests a minute on this plan, and a background
    // enrichment run can consume the whole budget. Company facts change slowly
    // and are already cached, so reuse a recent row and spend the request we
    // can afford on the price — which is the part that actually goes stale.
    const { data: cached } = await db
      .from('security_fundamentals')
      .select('name, sector, market_cap, shares_outstanding, employees, list_date, homepage, updated_at')
      .eq('ticker', sym).eq('status', 'ok').maybeSingle();

    const fresh = cached?.updated_at
      && Date.now() - new Date(cached.updated_at).getTime() < 7 * 864e5;

    // Price first: under contention this is the call worth winning.
    const prev = await getPrevClose(sym).catch(() => null);

    const d = fresh
      ? {
          name: cached!.name, sic_description: cached!.sector,
          market_cap: cached!.market_cap,
          share_class_shares_outstanding: cached!.shares_outstanding,
          total_employees: cached!.employees, list_date: cached!.list_date,
          homepage_url: cached!.homepage, description: undefined as string | undefined,
        }
      : await getTickerDetails(sym);
    if (!d) return null;

    // Last daily close. Polygon's realtime snapshot is not on this plan, so this
    // is an end-of-day price, and it is labelled as one — quoting it as "the
    // price" would be wrong the moment the market opens.
    const price = prev?.c
      ? { close: prev.c, asOf: prev.t ? new Date(prev.t).toISOString().slice(0, 10) : 'last close' }
      : null;

    const out = {
      name: d.name ?? sym,
      sector: d.sic_description ?? null,
      last_close: price?.close ?? null,
      last_close_date: price?.asOf ?? null,
      price_note: price ? 'End-of-day close, not a live quote.' : 'No price available.',
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

/**
 * Institutional ownership beyond the tracked universe, via EDGAR full-text
 * search over 13F filings for the company's CUSIP.
 *
 * EDGAR indexes filing *text*, not position sizes, so this answers "who
 * disclosed this" and cannot rank by stake. Saying otherwise would invent a
 * league table out of a word search, so the result labels the limit explicitly
 * and the Analyst is told to repeat it.
 */
async function findInstitutionalHolders(ticker: string) {
  const sym = ticker.toUpperCase().trim();

  const { data: seed } = await db
    .from('holdings').select('cusip, cusip6, issuer_name')
    .eq('ticker', sym).eq('instrument_type', 'equity')
    .not('cusip', 'is', null).limit(1).maybeSingle();

  if (!seed?.cusip) {
    return { ticker: sym, error: `No CUSIP on record for ${sym}, so EDGAR cannot be searched for it.` };
  }

  const year = new Date().getFullYear();
  try {
    const res = await axios.get('https://efts.sec.gov/LATEST/search-index', {
      params: {
        q: `"${seed.cusip}"`, forms: '13F-HR',
        dateRange: 'custom', startdt: `${year - 1}-01-01`, enddt: `${year}-12-31`,
      },
      headers: { 'User-Agent': process.env.SEC_USER_AGENT || 'Trove 13F Follower' },
      timeout: 20000,
    });

    const buckets: { key: string; doc_count: number }[] =
      res.data?.aggregations?.entity_filter?.buckets ?? [];

    const institutions = buckets.map(b => {
      const cik = (b.key.match(/CIK (\d{10})/) || [])[1] ?? null;
      const name = b.key.replace(/\s*\(CIK \d{10}\)\s*$/, '').replace(/\s{2,}/g, ' ').trim();
      return { name, cik, filings_mentioning: b.doc_count };
    });

    return {
      ticker: sym,
      issuer: seed.issuer_name ?? null,
      cusip: seed.cusip,
      total_13f_filings_mentioning: res.data?.hits?.total?.value ?? null,
      institutions,
      note: 'From EDGAR full-text search of 13F filings. It shows which institutions disclosed the CUSIP, ranked by how many filings mention it — NOT by position size. Do not present this as largest-shareholder ranking. EDGAR caps the entity list, so this is a sample, not the complete holder list.',
    };
  } catch (e: any) {
    return { ticker: sym, error: `EDGAR search failed: ${e.response?.status ?? e.message}` };
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
    case 'find_institutional_holders': return findInstitutionalHolders(input.ticker);
    case 'get_user_portfolio':  return getUserPortfolio(userId);
    default:                    return { error: `Unknown tool: ${name}` };
  }
}
