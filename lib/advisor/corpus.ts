import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';

/**
 * The universe digest — a frozen, plain-text rendering of every fund in the
 * global universe, built once per sync and read verbatim on every Ed turn.
 *
 * Two rules keep this cacheable, and both matter more than they look:
 *
 * 1. NEVER build this in the request path. It is serialised once, stored, and
 *    read back as a string. Rebuilding per request re-serialises objects whose
 *    key order can drift, and one drifted byte invalidates the whole prefix.
 * 2. NEVER put a timestamp in it. "As of" dates belong to individual funds
 *    (they are real filing facts); today's date belongs in the per-turn block.
 */

const POSITIONS_PER_FUND = 25;
const CONSENSUS_LIMIT = 150;

// Mirrors lib/recommendations/analyzer.ts — non-equity products that carry no
// conviction signal. Kept in sync deliberately rather than imported, because the
// analyzer's copy is tuned for scoring and this one for display.
const NON_EQUITY = new Set([
  'SHY','IEF','TLT','GOVT','BND','AGG','LQD','HYG','JNK','VCSH','VCIT','VGSH','VGIT','VGLT',
  'MUB','TIP','VTIP','SCHZ','SCHO','SCHR','SCHB','BNDX','EMB','IGIB','IGSB','USHY',
  'FLOT','NEAR','BSV','BIV','BLV','BSCO','BSCP','BSCQ','GSY','MINT','SHV','ICSH','JPST',
  'GLD','IAU','SLV','PDBC','DJP','SGOL','GLDM','BAR','SIVR','GDX','GDXJ','USO','UNG',
  'IBIT','FBTC','GBTC','BITO','ETHE','ETHW','ARKB','BTCO','HODL','EZBC','DEFI',
]);

const EQUITY_TICKER = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

const TYPE_LABEL: Record<string, string> = {
  hedge_fund: 'hedge fund',
  asset_manager: 'asset manager',
  endowment: 'endowment',
  sovereign_wealth: 'sovereign wealth fund',
  corporate: 'corporate filer',
};

interface FundRow {
  id: string; cik: string; name: string;
  entity_type: string; filer_note: string;
}
interface HoldingRow {
  fund_id: string; ticker: string; value: number; weight: number;
  quarter: string; period_end: string | null;
  cusip: string | null; issuer_name: string | null;
}

/**
 * Cross-fund identity. CUSIP is what the filing reports and is unique per
 * security; the ticker is an OpenFIGI guess that silently falls back to the first
 * six letters of the issuer name. Keying consensus on the ticker means Spotify
 * held as SPOT by one fund and SPOTIF by another never aggregates.
 */
function securityKey(h: HoldingRow): string {
  return h.cusip ? `c:${h.cusip}` : `t:${h.ticker}`;
}

/** Prefer a resolved ticker for display; fall back to the issuer name. */
function displayName(ticker: string, issuer: string | null): string {
  const resolved = EQUITY_TICKER.test(ticker) && !NON_EQUITY.has(ticker);
  if (resolved) return ticker;
  return issuer ? `${issuer.replace(/\s+/g, ' ').trim()}` : ticker;
}

function prevQuarter(q: string): string {
  const [y, n] = q.split('-Q');
  const qn = parseInt(n, 10);
  return qn === 1 ? `${parseInt(y, 10) - 1}-Q4` : `${y}-Q${qn - 1}`;
}

function money(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

/**
 * Cached market caps give every position a size, so a 4% weight in a $900M
 * company reads differently from 4% in a $2T one. These are day-end figures
 * refreshed by scripts/enrich-fundamentals.js — when the user asks about a
 * specific company, get_stock_analysis fetches a fresh one instead.
 */
async function marketCaps(): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{ ticker: string; market_cap: number | null }>((from, to) =>
    db.from('security_fundamentals').select('ticker, market_cap')
      .eq('status', 'ok').order('ticker').range(from, to)
  ).catch(() => []); // table may not exist yet — the digest is still valid without it

  const m = new Map<string, string>();
  for (const r of rows) if (r.market_cap) m.set(r.ticker, money(r.market_cap));
  return m;
}

/**
 * Render the whole universe. Each fund is described from its own latest filing,
 * not a single global quarter — filers are not synchronised (Pershing Square can
 * be a full quarter behind Tiger Global) and pretending otherwise silently
 * compares positions against the wrong baseline.
 */
export async function buildDigest(): Promise<{ digest: string; fundCount: number }> {
  const { data: funds } = await db
    .from('funds')
    .select('id, cik, name, entity_type, filer_note')
    .is('user_id', null)
    .eq('enabled', true)
    .order('name');

  const fundRows = (funds ?? []) as FundRow[];
  if (!fundRows.length) return { digest: '', fundCount: 0 };

  // Paged: the holdings table is well past PostgREST's 1,000-row default cap,
  // and a truncated read here silently produces a digest missing most funds.
  const holdings = await fetchAllRows<HoldingRow>((from, to) =>
    db.from('holdings')
      .select('fund_id, ticker, value, weight, quarter, period_end, cusip, issuer_name')
      .in('fund_id', fundRows.map(f => f.id))
      .order('id')
      .range(from, to)
  );

  const { data: theses } = await db.from('fund_theses').select('fund_id, thesis');
  const thesisByFund = new Map((theses ?? []).map(t => [t.fund_id, t.thesis as string]));
  const caps = await marketCaps();

  const byFund = new Map<string, HoldingRow[]>();
  for (const h of holdings) {
    if (!byFund.has(h.fund_id)) byFund.set(h.fund_id, []);
    byFund.get(h.fund_id)!.push(h);
  }

  const blocks: string[] = [];
  // security key -> { funds holding it, summed weight, net new positions }
  const consensus = new Map<
    string,
    { label: string; ticker: string; cap?: string; holders: string[]; weight: number; added: number }
  >();

  for (const fund of fundRows) {
    const rows = byFund.get(fund.id) ?? [];
    if (!rows.length) continue;

    const latest = rows.map(r => r.quarter).sort().reverse()[0];
    const prior = prevQuarter(latest);
    const current = rows.filter(r => r.quarter === latest);
    const previous = rows.filter(r => r.quarter === prior);
    const hasHistory = previous.length > 0;

    const prevWeight = new Map(previous.map(r => [r.ticker, r.weight]));
    const currentTickers = new Set(current.map(r => r.ticker));

    const sorted = [...current].sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, r) => s + r.value, 0);
    const top10 = sorted.slice(0, 10).reduce((s, r) => s + r.weight, 0);
    const periodEnd = current.find(r => r.period_end)?.period_end ?? null;

    const label = TYPE_LABEL[fund.entity_type] ?? fund.entity_type;
    const head = [
      `## ${fund.name} (CIK ${fund.cik}) — ${label}`,
      `As of ${latest}${periodEnd ? ` (period ending ${periodEnd})` : ''} · ` +
        `${sorted.length} positions · ${money(total)} reported · top-10 = ${top10.toFixed(1)}%`,
    ];
    if (fund.filer_note) head.push(`Note: ${fund.filer_note}`);
    if (!hasHistory) head.push('Note: no prior-quarter filing on record — position changes cannot be computed.');

    const thesis = thesisByFund.get(fund.id);
    if (thesis) head.push(`Thesis: ${thesis.replace(/\s+/g, ' ').trim()}`);

    const lines: string[] = [];
    for (const r of sorted.slice(0, POSITIONS_PER_FUND)) {
      let delta = '';
      if (hasHistory) {
        const before = prevWeight.get(r.ticker);
        if (before === undefined) delta = ' NEW';
        else {
          const d = r.weight - before;
          delta = ` ${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
        }
      }
      const label = displayName(r.ticker, r.issuer_name);
      const cap = caps.get(r.ticker);
      lines.push(`${label} ${r.weight.toFixed(1)}%${delta}${cap ? ` [${cap}]` : ''}`);

      // Aggregate on the security's real identity, and exclude only genuine
      // non-equity products — never on the shape of the ticker string, which
      // would drop every position OpenFIGI failed to resolve.
      if (!NON_EQUITY.has(r.ticker) && r.weight >= 0.25) {
        const key = securityKey(r);
        const c = consensus.get(key) ?? { label, ticker: r.ticker, cap, holders: [], weight: 0, added: 0 };
        if (!c.holders.includes(fund.name)) c.holders.push(fund.name);
        c.weight += r.weight;
        if (hasHistory && !prevWeight.has(r.ticker)) c.added++;
        consensus.set(key, c);
      }
    }

    head.push(
      `Top ${Math.min(POSITIONS_PER_FUND, sorted.length)} (weight%${hasHistory ? ', Δ vs ' + prior : ''}):`,
      '  ' + lines.join('  ')
    );

    if (hasHistory) {
      const exited = previous.filter(r => !currentTickers.has(r.ticker))
        .sort((a, b) => b.weight - a.weight).slice(0, 10).map(r => r.ticker);
      if (exited.length) head.push(`Exited since ${prior}: ${exited.join(', ')}`);
    }

    blocks.push(head.join('\n'));
  }

  // Cross-fund consensus — the view no single fund block can give.
  const ranked = [...consensus.values()]
    .map(c => ({
      label: c.label,
      cap: c.cap,
      holders: c.holders.length,
      weight: c.weight,
      added: c.added,
      score: (c.holders.length / fundRows.length) * c.weight,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CONSENSUS_LIMIT);

  const consensusBlock = [
    '# NAMES HELD ACROSS MULTIPLE FUNDS',
    'Ranked by breadth × aggregate weight, aggregated on the security identity',
    'reported in the filing. "held" = how many funds report it; "agg%" = summed',
    'weight across those funds; "new" = funds that opened it last quarter.',
    'Entries shown as a company name rather than a ticker are ones whose ticker',
    'could not be resolved — the position is real, the symbol is simply unknown.',
    'Market cap is a day-end figure and may be blank for names not yet priced.',
    'security | held | agg% | new | mkt cap',
    ...ranked.map(r => `${r.label} | ${r.holders} | ${r.weight.toFixed(1)} | ${r.added} | ${r.cap ?? '-'}`),
  ].join('\n');

  const digest = [
    '# FUNDS TROVE TRACKS',
    // Header wording is deliberate: the model echoes the vocabulary it reads here,
    // and words like "universe" or "corpus" are engineering terms that mean
    // nothing to a reader when they surface in an answer.
    `${fundRows.length} institutions that file 13Fs. Each block states its own "as of" quarter —`,
    'filers are not synchronised, and a fund may be a full quarter behind its peers.',
    'All 13F positions are disclosed up to 45 days after the quarter closes, so they',
    'may already have changed.',
    '',
    blocks.join('\n\n'),
    '',
    consensusBlock,
  ].join('\n');

  return { digest, fundCount: fundRows.length };
}

/** Read the active snapshot. This is what the request path calls. */
export async function getActiveDigest(): Promise<{ digest: string; fundCount: number; tokenCount: number } | null> {
  const { data } = await db
    .from('fund_corpus_snapshots')
    .select('digest, fund_count, token_count')
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return null;
  return { digest: data.digest, fundCount: data.fund_count, tokenCount: data.token_count };
}

/** Build, measure, store, and activate a new snapshot. Called after a sync. */
export async function refreshSnapshot(countTokens: (text: string) => Promise<number>) {
  const { digest, fundCount } = await buildDigest();
  if (!digest) throw new Error('Digest is empty — is the global universe seeded and synced?');

  const tokenCount = await countTokens(digest);

  await db.from('fund_corpus_snapshots').update({ is_active: false }).eq('is_active', true);
  const { data, error } = await db
    .from('fund_corpus_snapshots')
    .insert({
      label: new Date().toISOString().slice(0, 10),
      digest,
      token_count: tokenCount,
      fund_count: fundCount,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  return { id: data.id, tokenCount, fundCount };
}
