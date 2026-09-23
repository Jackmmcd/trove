import { db } from '@/lib/supabase/admin';
import { isBrokerOwner } from '@/lib/broker/owner';

/**
 * The user's actual holdings, whichever account those live in.
 *
 * The dashboard resolves this the same way (see /api/account/source): the
 * brokerage credentials are a single set configured server-side, so the live
 * account belongs to whoever owns them and everyone else has a paper account.
 * The Analyst was reading paper positions unconditionally, which meant it
 * discussed a $10k practice account while the owner was looking at a real one.
 */

export interface Holding {
  ticker: string;
  shares: number;
  value: number;
  weight: number;
}

export interface Portfolio {
  source: 'broker' | 'paper';
  cash: number;
  equity: number;
  positionCount: number;
  positions: Holding[];
  /** How `value` was derived — live marks differ from cost basis, and it matters. */
  basis: 'market' | 'cost';
}

// Ownership is decided in lib/broker/owner.ts, shared with /api/account/source
// so the Analyst and the dashboard always name the same account.
export { isBrokerOwner };

async function brokerPortfolio(): Promise<Portfolio | null> {
  try {
    const { getValidAccessToken } = await import('@/lib/auth/session');
    const token = await getValidAccessToken();
    if (!token) return null;

    const { getTastytradeClient } = await import('@/lib/tastytrade/client');
    const client = getTastytradeClient(token);
    const [balance, raw] = await Promise.all([
      client.getAccountBalance(),
      client.getPositions(),
    ]);

    // getPositions() declares TastytradePosition but returns the raw API rows
    // uncast, so the live keys are kebab-case. Dashboard.tsx reads both
    // spellings for the same reason.
    const rows = (raw ?? []) as unknown as Record<string, unknown>[];
    const equities = rows.filter(p => {
      const t = (p['instrument-type'] ?? p.instrumentType ?? '') as string;
      return t === 'Equity' || t === 'Stock';
    });

    const positions = equities.map(p => {
      const shares = Number(p.quantity ?? 0);
      const mark = Number(p['close-price'] ?? p['mark-price'] ?? p['average-open-price'] ?? 0);
      return { ticker: String(p.symbol), shares, value: shares * mark, weight: 0 };
    }).filter(p => p.value > 0);

    const equity = positions.reduce((s, p) => s + p.value, 0);
    for (const p of positions) p.weight = equity > 0 ? (p.value / equity) * 100 : 0;
    positions.sort((a, b) => b.value - a.value);

    return {
      source: 'broker',
      cash: Number(balance?.cashAvailableForTrading ?? 0),
      equity,
      positionCount: positions.length,
      positions,
      basis: 'market',
    };
  } catch (e) {
    // Fall back to paper rather than showing nothing — but say so loudly, since
    // a silent fallback here is exactly how the wrong account gets discussed.
    console.error('broker portfolio unavailable, falling back to paper:', e);
    return null;
  }
}

async function paperPortfolio(userId: string): Promise<Portfolio> {
  const [{ data: account }, { data: rows }] = await Promise.all([
    db.from('paper_accounts').select('cash').eq('user_id', userId).maybeSingle(),
    db.from('paper_positions').select('symbol, quantity, avg_open_price').eq('user_id', userId),
  ]);

  const positions = (rows ?? []).map(p => ({
    ticker: p.symbol as string,
    shares: Number(p.quantity),
    value: Number(p.quantity) * Number(p.avg_open_price),
    weight: 0,
  }));
  const equity = positions.reduce((s, p) => s + p.value, 0);
  for (const p of positions) p.weight = equity > 0 ? (p.value / equity) * 100 : 0;
  positions.sort((a, b) => b.value - a.value);

  return {
    source: 'paper',
    cash: Number(account?.cash ?? 0),
    equity,
    positionCount: positions.length,
    positions,
    basis: 'cost',
  };
}

export async function getPortfolio(userId: string, email?: string | null): Promise<Portfolio> {
  if (isBrokerOwner(email)) {
    const broker = await brokerPortfolio();
    if (broker) return broker;
  }
  return paperPortfolio(userId);
}
