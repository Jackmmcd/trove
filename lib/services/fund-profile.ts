import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { getSECApiClient, decodeXmlEntities } from '@/lib/sec-api/client';
import { directoryEntry, normalizeCik, type DirectoryFund } from '@/lib/funds/directory';
import { syncFund } from '@/lib/services/fund-sync';

/**
 * One fund's page: who it is and what it holds.
 *
 * Read-through cache over EDGAR. The first request for a fund pulls its latest
 * 13F and stores it in `holdings`; every request after that is served from the
 * database. The only network call on a warm read is a single EDGAR submissions
 * lookup, and only once a newer filing could exist (the next quarter has
 * closed) — and even that is memoised for a few hours per fund.
 */

// The OpenFIGI phase of a cold load. Anonymous OpenFIGI resolves ~230 CUSIPs a
// minute; a large filer's tail beyond this keeps its CUSIP and shows by issuer
// name. Set OPENFIGI_API_KEY and the whole book resolves well inside it.
const TICKER_BUDGET_MS = 90_000;
const FRESHNESS_TTL_MS = 6 * 60 * 60 * 1000;
const SECTOR_LOOKUP_LIMIT = 300;

const TYPE_LABEL: Record<string, string> = {
  hedge_fund: 'Hedge fund',
  asset_manager: 'Asset manager',
  endowment: 'Endowment',
  sovereign_wealth: 'Sovereign wealth fund',
  corporate: 'Corporate filer',
};

export interface ProfilePosition {
  ticker: string; resolved: boolean; issuer: string | null; cusip: string | null;
  instrument: string; shares: number; value: number; weight: number;
  change: number | 'NEW' | null; sector: string | null;
  /** Set for option lines. A put is a bet the stock falls; value is the underlying, not the premium. */
  option: 'put' | 'call' | null;
}

export interface FundProfile {
  fund: {
    cik: string; name: string; entity_type: string; entity_label: string;
    note: string | null; aliases: string[]; tags: string[]; sync: string;
  };
  quarter: string | null;
  period_end: string | null;
  filing_date: string | null;
  /** 'cache' = served from the database; 'edgar' = fetched on this request. */
  source: 'cache' | 'edgar';
  /** Set when EDGAR has a newer filing we could not load just now. */
  stale_warning: string | null;
  thesis: string | null;
  stats: {
    positions: number; total_value: number;
    top10_weight: number; top25_weight: number; unresolved: number;
    /** Option lines as a share of reported value — shown so a put-heavy book can't read as a long one. */
    puts: { count: number; weight: number }; calls: { count: number; weight: number };
  };
  composition: {
    by_instrument: { type: string; weight: number; count: number }[];
    by_sector: { sector: string; weight: number; count: number }[];
    /** Share of reported value whose sector is known — the sector chart covers only this. */
    sector_coverage: number;
  };
  has_prior_quarter: boolean;
  exited: { ticker: string; issuer: string | null; weight: number; option: 'put' | 'call' | null }[];
  positions: ProfilePosition[];
}

interface HoldingRow {
  ticker: string; cusip: string | null; issuer_name: string | null; instrument_type: string | null;
  shares: number; value: number; weight: number; quarter: string;
  period_end: string | null; filing_date: string | null; put_call: 'put' | 'call' | null;
}

export class FundNotFoundError extends Error {}

const EQUITY_TICKER = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

function prevQuarter(q: string): string {
  const [y, n] = q.split('-Q');
  const qn = parseInt(n, 10);
  return qn === 1 ? `${parseInt(y, 10) - 1}-Q4` : `${y}-Q${qn - 1}`;
}

/** True once the quarter after `periodEnd` has closed — before that, no newer 13F can exist. */
function newerFilingPossible(periodEnd: string | null): boolean {
  if (!periodEnd) return true;
  const d = new Date(`${periodEnd}T00:00:00Z`);
  const nextQuarterEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 4, 0));
  return Date.now() > nextQuarterEnd.getTime();
}

// Per-instance memo of "EDGAR's newest period for this CIK", so a busy page
// doesn't hit EDGAR on every view. Losing it on a cold start costs one request.
const latestSeen = new Map<string, { periodEnd: string | null; at: number }>();

async function edgarLatestPeriod(cik: string): Promise<string | null> {
  const hit = latestSeen.get(cik);
  if (hit && Date.now() - hit.at < FRESHNESS_TTL_MS) return hit.periodEnd;
  const latest = await getSECApiClient().latest13F(cik);
  latestSeen.set(cik, { periodEnd: latest?.periodEnd ?? null, at: Date.now() });
  return latest?.periodEnd ?? null;
}

// Two people opening the same cold fund at once would otherwise both download
// it, and the second sync's delete would land in the middle of the first's insert.
const inflight = new Map<string, Promise<void>>();

async function load(cik: string): Promise<void> {
  const running = inflight.get(cik);
  if (running) return running;
  const p = (async () => {
    const result = await syncFund(cik, undefined, undefined, { tickerBudgetMs: TICKER_BUDGET_MS });
    if (!result.success) throw new Error(result.error ?? 'Could not load this fund from EDGAR.');
  })().finally(() => inflight.delete(cik));
  inflight.set(cik, p);
  return p;
}

async function findOrCreateFund(cik: string, entry: DirectoryFund | undefined, allowEdgar = false) {
  const { data: fund } = await db.from('funds')
    .select('id, cik, name, entity_type, filer_note').eq('cik', cik).is('user_id', null).maybeSingle();
  if (fund) return fund;

  // In the directory but not seeded yet: create the row so the page works
  // before scripts/seed-directory.js has run. The seed later leaves it alone.
  // Outside the directory, a fund is only created when a user follows it — and
  // only if EDGAR confirms it actually files 13Fs, so a typo'd CIK can't add
  // some unrelated company to everyone's universe.
  let name = entry?.name;
  if (!entry) {
    if (!allowEdgar) throw new FundNotFoundError(`Trove does not track a fund with CIK ${cik}.`);
    const sec = getSECApiClient();
    const [company, latest] = await Promise.all([
      sec.lookupCompany(cik).catch(() => null),
      sec.latest13F(cik).catch(() => null),
    ]);
    if (!company) throw new FundNotFoundError(`No SEC filer has CIK ${cik}.`);
    if (!latest) throw new FundNotFoundError(`${company.name} (CIK ${cik}) has never filed a 13F, so there are no holdings to follow.`);
    name = company.name;
  }

  const { data: created, error } = await db.from('funds').insert({
    cik, name, enabled: true, user_id: null,
    entity_type: entry?.entity_type ?? 'hedge_fund', filer_note: entry?.note ?? '',
  }).select('id, cik, name, entity_type, filer_note').single();
  if (error) throw new Error(error.message);
  return created;
}

/** The global fund row for a CIK, creating it (directory or EDGAR-verified) if needed. */
export async function ensureFund(rawCik: string) {
  const cik = normalizeCik(rawCik);
  return findOrCreateFund(cik, directoryEntry(cik), true);
}

async function latestQuarter(fundId: string) {
  const { data } = await db.from('holdings')
    .select('quarter, period_end, filing_date').eq('fund_id', fundId).is('user_id', null)
    .order('quarter', { ascending: false }).limit(1).maybeSingle();
  return data as { quarter: string; period_end: string | null; filing_date: string | null } | null;
}

async function quarterRows(fundId: string, quarter: string): Promise<HoldingRow[]> {
  return fetchAllRows<HoldingRow>((from, to) =>
    db.from('holdings')
      .select('ticker, cusip, issuer_name, instrument_type, shares, value, weight, quarter, period_end, filing_date, put_call')
      .eq('fund_id', fundId).is('user_id', null).eq('quarter', quarter)
      .order('value', { ascending: false }).order('id')
      .range(from, to));
}

async function sectors(tickers: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < tickers.length; i += 150) {
    const { data, error } = await db.from('security_fundamentals')
      .select('ticker, sector').eq('status', 'ok').in('ticker', tickers.slice(i, i + 150));
    if (error) return out; // table not migrated — the page just omits sectors
    for (const r of data ?? []) if (r.sector) out.set(r.ticker, r.sector);
  }
  return out;
}

/** SIC descriptions are shouty and long ("SEMICONDUCTORS & RELATED DEVICES"). */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\bAnd\b/g, 'and');
}

export async function getFundProfile(rawCik: string): Promise<FundProfile> {
  const cik = normalizeCik(rawCik);
  const entry = directoryEntry(cik);
  const fund = await findOrCreateFund(cik, entry);

  let source: FundProfile['source'] = 'cache';
  let staleWarning: string | null = null;
  let latest = await latestQuarter(fund.id);

  if (!latest) {
    await load(cik);
    source = 'edgar';
    latest = await latestQuarter(fund.id);
  } else if (newerFilingPossible(latest.period_end)) {
    try {
      const edgarPeriod = await edgarLatestPeriod(cik);
      if (edgarPeriod && latest.period_end && edgarPeriod > latest.period_end) {
        try {
          await load(cik);
          source = 'edgar';
          latest = await latestQuarter(fund.id);
        } catch (e: any) {
          staleWarning = `A newer filing (period ending ${edgarPeriod}) is on EDGAR but could not be loaded: ${e.message}`;
        }
      }
    } catch {
      // EDGAR unreachable — the cached quarter is still the best answer we have.
    }
  }

  const fundInfo: FundProfile['fund'] = {
    cik,
    name: entry?.name ?? fund.name,
    entity_type: fund.entity_type,
    entity_label: TYPE_LABEL[fund.entity_type] ?? fund.entity_type,
    note: fund.filer_note || entry?.note || null,
    aliases: entry?.aliases ?? [],
    tags: entry?.tags ?? [],
    sync: entry?.sync ?? 'scheduled',
  };

  const empty: FundProfile = {
    fund: fundInfo, quarter: null, period_end: null, filing_date: null, source, stale_warning: staleWarning,
    thesis: null,
    stats: {
      positions: 0, total_value: 0, top10_weight: 0, top25_weight: 0, unresolved: 0,
      puts: { count: 0, weight: 0 }, calls: { count: 0, weight: 0 },
    },
    composition: { by_instrument: [], by_sector: [], sector_coverage: 0 },
    has_prior_quarter: false, exited: [], positions: [],
  };
  if (!latest) return empty;

  const [current, previous, thesisRow] = await Promise.all([
    quarterRows(fund.id, latest.quarter),
    quarterRows(fund.id, prevQuarter(latest.quarter)),
    db.from('fund_theses').select('thesis').eq('fund_id', fund.id).maybeSingle(),
  ]);

  const total = current.reduce((s, r) => s + r.value, 0);
  // Shares and options on one CUSIP are separate positions, quarter to quarter too.
  const posKey = (r: HoldingRow) => `${r.cusip ?? r.ticker}|${r.put_call ?? ''}`;
  const priorWeight = new Map(previous.map(r => [posKey(r), r.weight]));
  const hasPrior = previous.length > 0;
  const sectorOf = await sectors(
    current.slice(0, SECTOR_LOOKUP_LIMIT).map(r => r.ticker).filter(t => EQUITY_TICKER.test(t)),
  );

  const positions: ProfilePosition[] = current.map(r => {
    const key = posKey(r);
    return {
      ticker: r.ticker,
      resolved: EQUITY_TICKER.test(r.ticker),
      issuer: r.issuer_name && decodeXmlEntities(r.issuer_name),
      cusip: r.cusip,
      instrument: r.instrument_type ?? 'unknown',
      option: r.put_call,
      shares: r.shares,
      value: r.value,
      weight: r.weight,
      change: !hasPrior ? null : priorWeight.has(key) ? Number((r.weight - priorWeight.get(key)!).toFixed(2)) : 'NEW',
      sector: sectorOf.get(r.ticker) ? titleCase(sectorOf.get(r.ticker)!) : null,
    };
  });

  const group = <K extends string>(keyOf: (p: ProfilePosition) => K | null) => {
    const m = new Map<K, { weight: number; count: number }>();
    for (const p of positions) {
      const k = keyOf(p);
      if (!k) continue;
      const g = m.get(k) ?? { weight: 0, count: 0 };
      g.weight += p.weight; g.count++;
      m.set(k, g);
    }
    return [...m.entries()].map(([k, g]) => ({ k, weight: Number(g.weight.toFixed(2)), count: g.count }))
      .sort((a, b) => b.weight - a.weight);
  };

  // Sectors describe what the fund owns. A put on Palantir does not make the
  // fund 66% software, so option lines stay out of this chart.
  const bySector = group(p => (p.option ? null : p.sector));
  const currentKeys = new Set(current.map(posKey));
  const sum = (n: number) => Number(positions.slice(0, n).reduce((s, p) => s + p.weight, 0).toFixed(2));
  const optionStats = (kind: 'put' | 'call') => {
    const ps = positions.filter(p => p.option === kind);
    return { count: ps.length, weight: Number(ps.reduce((s, p) => s + p.weight, 0).toFixed(2)) };
  };

  return {
    ...empty,
    quarter: latest.quarter,
    period_end: latest.period_end,
    filing_date: latest.filing_date ? latest.filing_date.slice(0, 10) : null,
    thesis: (thesisRow.data?.thesis as string | undefined) || null,
    stats: {
      positions: positions.length,
      total_value: total,
      top10_weight: sum(10),
      top25_weight: sum(25),
      unresolved: positions.filter(p => !p.resolved).length,
      puts: optionStats('put'),
      calls: optionStats('call'),
    },
    composition: {
      by_instrument: group(p => (p.option ? `${p.option}_option` : p.instrument)).map(g => ({ type: g.k, weight: g.weight, count: g.count })),
      by_sector: bySector.map(g => ({ sector: g.k, weight: g.weight, count: g.count })),
      sector_coverage: Number(bySector.reduce((s, g) => s + g.weight, 0).toFixed(1)),
    },
    has_prior_quarter: hasPrior,
    exited: previous
      .filter(r => !currentKeys.has(posKey(r)))
      .sort((a, b) => b.weight - a.weight).slice(0, 15)
      .map(r => ({ ticker: r.ticker, issuer: r.issuer_name && decodeXmlEntities(r.issuer_name), weight: Number(r.weight.toFixed(2)), option: r.put_call })),
    positions,
  };
}
