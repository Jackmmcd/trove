import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';

/**
 * What the landing page says Trove tracks, read from the universe itself.
 *
 * The page used to state this from memory — "hundreds of funds", three named
 * funds with invented YTD returns — and every one of those numbers was wrong.
 * Anything on the page that claims coverage is derived here instead, so the
 * claim and the data cannot drift apart.
 */

export interface UniverseFund {
  name: string;
  type: string;
  quarter: string;     // that fund's own latest filing, not a global one
  positions: number;
  value: string;       // disclosed equity value in that filing
}

/** One real fund rendered the way a filing reads, for the sample panel. */
export interface Spotlight {
  fund: string;
  quarter: string;
  positions: number;
  value: string;
  topHolding: string;
  topWeight: string;
  top10: string;
}

export interface UniverseStats {
  fundCount: number;
  positions: number;
  issuers: number;
  totalValue: string;
  latestQuarter: string;
  funds: UniverseFund[];
  spotlight: Spotlight | null;
}

const TYPE_LABEL: Record<string, string> = {
  hedge_fund: 'HEDGE FUND',
  asset_manager: 'ASSET MANAGER',
  endowment: 'ENDOWMENT',
  sovereign_wealth: 'SOVEREIGN WEALTH',
  corporate: 'CORPORATE FILER',
};

/**
 * EDGAR names are shouted, suffixed and occasionally carry a state tag
 * ("BROOKFIELD Corp /ON/"). Tidy them for display only — the stored name stays
 * as filed, because that is what matches the filing.
 */
function displayName(raw: string): string {
  let n = raw.replace(/\s*\/[A-Z]{2}\/\s*$/, '').trim();
  n = n.replace(/[,\s]+(L\.?L\.?C\.?|L\.?P\.?|Inc\.?|Corp\.?|Ltd\.?|Co\.?|P\.?J\.?S\.?C\.?)\.?$/i, '').trim();
  n = n.replace(/[,\s]+(L\.?L\.?C\.?|L\.?P\.?|Inc\.?|Ltd\.?)\.?$/i, '').trim();
  // Title-case only the all-caps ones; "a16z" and "iCapital" are deliberate.
  if (n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  }
  return n;
}

function money(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

interface FundRow { id: string; name: string; entity_type: string }
interface HoldingRow {
  fund_id: string; ticker: string; value: number; weight: number;
  quarter: string; cusip6: string | null; issuer_name: string | null;
}

const EQUITY_TICKER = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

/** The ticker when OpenFIGI resolved one, the issuer name when it fell back. */
function security(h: HoldingRow): string {
  if (EQUITY_TICKER.test(h.ticker)) return h.ticker;
  return h.issuer_name?.replace(/\s+/g, ' ').trim() || h.ticker;
}

/**
 * Counted from each fund's own latest filing. Filers are not synchronised, so
 * summing every quarter on record would double-count a fund that has filed four
 * times, and pinning everyone to one global quarter would drop the laggards.
 */
export async function getUniverseStats(): Promise<UniverseStats | null> {
  try {
    const { data: funds } = await db
      .from('funds')
      .select('id, name, entity_type')
      .is('user_id', null)
      .eq('enabled', true);
    if (!funds?.length) return null;

    const holdings = await fetchAllRows<HoldingRow>((from, to) =>
      db.from('holdings')
        .select('fund_id, ticker, value, weight, quarter, cusip6, issuer_name')
        .order('id').range(from, to)
    );

    const latest = new Map<string, string>();
    for (const h of holdings) {
      const q = latest.get(h.fund_id);
      if (!q || h.quarter > q) latest.set(h.fund_id, h.quarter);
    }
    const current = holdings.filter(h => h.quarter === latest.get(h.fund_id));

    const ranked = (funds as FundRow[])
      .map(f => {
        const own = current.filter(h => h.fund_id === f.id);
        const total = own.reduce((s, h) => s + (h.value || 0), 0);
        return {
          id: f.id,
          total,
          row: {
            name: displayName(f.name),
            type: TYPE_LABEL[f.entity_type] ?? 'INSTITUTION',
            quarter: latest.get(f.id) ?? '—',
            positions: own.length,
            value: money(total),
          } satisfies UniverseFund,
        };
      })
      .sort((a, b) => b.total - a.total);
    const rows: UniverseFund[] = ranked.map(r => r.row);

    // Sample panel: the largest book on file, described from its own filing.
    const lead = ranked[0];
    const leadRows = lead ? current.filter(h => h.fund_id === lead.id) : [];
    const sorted = [...leadRows].sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const spotlight: Spotlight | null = rows[0] && sorted.length
      ? {
          fund: rows[0].name,
          quarter: rows[0].quarter,
          positions: rows[0].positions,
          value: rows[0].value,
          topHolding: security(sorted[0]),
          topWeight: `${(sorted[0].weight || 0).toFixed(1)}% of book`,
          top10: `${sorted.slice(0, 10).reduce((s, h) => s + (h.weight || 0), 0).toFixed(0)}% of book`,
        }
      : null;

    return {
      fundCount: funds.length,
      positions: current.length,
      issuers: new Set(current.map(h => h.cusip6 || h.ticker)).size,
      totalValue: money(current.reduce((s, h) => s + (h.value || 0), 0)),
      latestQuarter: [...latest.values()].sort().pop() ?? '—',
      funds: rows,
      spotlight,
    };
  } catch {
    // The page still renders without it; every section that uses these numbers
    // is written to disappear rather than fall back to an invented one.
    return null;
  }
}
