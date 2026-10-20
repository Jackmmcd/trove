'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import LoginButton from './LoginButton';
import useIsMobile from './useIsMobile';
import TradeModal from './TradeModal';
import { groupPositions, type BasketRecord, type PortfolioRow } from '@/lib/baskets/group';

interface AccountBalance {
  netLiquidity: number;
  totalEquity: number;
  cashAvailableForTrading: number;
  buyingPower: number;
}

interface Position {
  symbol: string;
  quantity: number;
  avgOpenPrice: number;
  currentPrice: number;
  totalValue: number;
  gainLoss: number;
  dailyPnL: number | null;
  weeklyPnL: number | null;
}

const B = {
  bg: 'var(--bg-000000)',
  panel: 'var(--bg-0d0d0d)',
  border: 'var(--bg-2a2a2a)',
  borderAmber: 'var(--bg-ff8c00)',
  amber: 'var(--bg-ff8c00)',
  amberDim: 'var(--bg-cc6d00)',
  green: 'var(--bg-00ff41)',
  red: 'var(--bg-ff3333)',
  cyan: 'var(--bg-00e5ff)',
  label: 'var(--fg-888888)',
  text: 'var(--fg-e0e0e0)',
};







// Module-level cache keyed by user ID — survives remounts, invalidates on account switch
const _caches = new Map<string, {
  balance: AccountBalance | null;
  positions: Position[];
  portfolioHistory: { date: string; value: number }[];
  isPaper: boolean;
  ts: number;
}>();
const CACHE_TTL = 3 * 60 * 1000;

/** Chart windows, sliced client-side from the single year the API returns. */
const TIMEFRAMES = [
  { id: '1W', days: 7,   label: 'Past week' },
  { id: '1M', days: 30,  label: 'Past month' },
  { id: '3M', days: 90,  label: 'Past 3 months' },
  { id: '6M', days: 180, label: 'Past 6 months' },
  { id: '1Y', days: 365, label: 'Past year' },
] as const;

export default function Dashboard() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<{ date: string; value: number }[]>([]);
  const [isPaper, setIsPaper] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [baskets, setBaskets] = useState<BasketRecord[]>([]);
  const [openBaskets, setOpenBaskets] = useState<Record<string, boolean>>({});
  const [timeframe, setTimeframe] = useState<string>('1M');

  // Basket membership decides how positions are grouped below, so it is loaded
  // once here rather than inside the row rendering.
  useEffect(() => {
    fetch('/api/baskets')
      .then(r => r.json())
      .then(d => {
        if (!d.success) return;
        setBaskets((d.data as any[]).map(b => ({
          ...b,
          orders: typeof b.orders === 'string' ? JSON.parse(b.orders) : b.orders,
        })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    import('@/utils/supabase/client').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data: { user } }) => {
        const uid = user?.id ?? 'anonymous';
        setUserId(uid);
        const cached = _caches.get(uid);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          setBalance(cached.balance);
          setPositions(cached.positions);
          setPortfolioHistory(cached.portfolioHistory);
          setIsPaper(cached.isPaper);
          setLoading(false);
        } else {
          fetchData(uid);
        }
      });
    });
  }, []);

  // Refetch when tab becomes visible — catches trades made on other pages
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && userId) {
        _caches.delete(userId);
        fetchData(userId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  const fetchData = async (uid = userId ?? 'anonymous') => {
    try {
      setLoading(true);
      setError(null);
      setRequiresAuth(false);

      // Ask the server which account this user should see. The brokerage
      // credentials are a single set in the environment, so only their owner
      // gets the live view; everyone else gets their own paper account.
      const sourceRes = await fetch('/api/account/source');
      const source = sourceRes.ok ? (await sourceRes.json()).source : 'paper';

      const paperBalanceRes = source === 'paper'
        ? await fetch('/api/paper/balance')
        : null;

      if (paperBalanceRes?.ok) {
        // ── Paper trading path ────────────────────────────────────────
        const paperBalance = await paperBalanceRes.json();
        const balanceVal: AccountBalance = paperBalance.data;
        setBalance(balanceVal);
        setIsPaper(true);

        const posRes = await fetch('/api/paper/positions');
        const posData = await posRes.json();
        const paperPositions: Position[] = posData.success ? posData.data : [];
        setPositions(paperPositions);
        setLoading(false);

        // The chart is the point of the page, and a paper account has a
        // history too — it just needed asking for.
        fetch('/api/tastytrade/portfolio-history?range=1y')
          .then(r => r.json())
          .then(d => { if (d.success && d.data?.length) setPortfolioHistory(d.data); })
          .catch(() => {});

        // Don't cache paper positions — always fetch fresh so trades from other pages show immediately
        _caches.delete(uid);
        return;
      }

      // ── Live Tastytrade path ──────────────────────────────────────
      // Reached only when the server said this user owns the brokerage
      // credentials. Guarded again here so a failed source lookup can never
      // fall through and show a stranger someone else's live positions.
      if (source !== 'broker') {
        setError('Could not load your account. Please refresh, or sign out and back in.');
        setLoading(false);
        return;
      }

      const [balanceRes, positionsRes] = await Promise.all([
        fetch('/api/tastytrade/balance'),
        fetch('/api/tastytrade/positions'),
      ]);

      if (balanceRes.status === 401 || positionsRes.status === 401) {
        const errorData = await balanceRes.json().catch(() => ({}));
        setRequiresAuth(true);
        setError(errorData.error || 'Please log in to view your account data');
        return;
      }

      if (!balanceRes.ok || !positionsRes.ok) throw new Error('Failed to fetch account data');

      const balanceData = await balanceRes.json();
      const positionsData = await positionsRes.json();

      const balanceVal: AccountBalance | null = balanceData.success ? balanceData.data : null;
      if (balanceVal) setBalance(balanceVal);

      const equities: any[] = positionsData.success
        ? positionsData.data.filter((p: any) => {
            const type = p['instrument-type'] || p.instrumentType || '';
            return type === 'Equity' || type === 'Stock';
          })
        : [];

      const stalePositions: Position[] = equities.map((p: any) => {
        const currentPrice = parseFloat(p['close-price'] || p['mark-price'] || '0');
        const avgOpenPrice = parseFloat(p['average-open-price'] || '0');
        const quantity = parseFloat(p.quantity || '0');
        return { symbol: p.symbol, quantity, avgOpenPrice, currentPrice, totalValue: currentPrice * quantity, gainLoss: (currentPrice - avgOpenPrice) * quantity, dailyPnL: null, weeklyPnL: null };
      });
      setPositions(stalePositions);
      setIsPaper(false);
      setLoading(false);

      const symbols = equities.map((p: any) => p.symbol).join(',');
      const abort = new AbortController();
      const abortTimer = setTimeout(() => abort.abort(), 25000);

      const [qData, hData, portData] = await Promise.all([
        symbols ? fetch(`/api/tastytrade/quotes?symbols=${encodeURIComponent(symbols)}&basis=close`).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
        symbols ? fetch(`/api/tastytrade/history?symbols=${encodeURIComponent(symbols)}`, { signal: abort.signal }).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
        fetch('/api/tastytrade/portfolio-history?range=1y', { signal: abort.signal }).then(r => r.json()).catch(() => ({})),
      ]);
      clearTimeout(abortTimer);

      const portHistory: { date: string; value: number }[] =
        portData.success && portData.data?.length > 0 ? portData.data : [];
      if (portHistory.length) setPortfolioHistory(portHistory);

      let finalPositions = stalePositions;
      if (symbols) {
        const prices: Record<string, number> = qData.success ? qData.data : {};
        const history: Record<string, { prev1Close: number | null; prev5Close: number | null }> = hData.success ? hData.data : {};
        finalPositions = stalePositions.map(p => {
          const livePrice = prices[p.symbol] ?? p.currentPrice;
          const hist = history[p.symbol];
          const dailyPnL = hist?.prev1Close ? (livePrice - hist.prev1Close) * p.quantity : null;
          const weeklyPnL = hist?.prev5Close ? (livePrice - hist.prev5Close) * p.quantity : null;
          return { ...p, currentPrice: livePrice, totalValue: livePrice * p.quantity, gainLoss: (livePrice - p.avgOpenPrice) * p.quantity, dailyPnL, weeklyPnL };
        });
        setPositions(finalPositions);
      }

      _caches.set(uid, { balance: balanceVal, positions: finalPositions, portfolioHistory: portHistory, isPaper: false, ts: Date.now() });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px', color: B.amber }}>
        <span style={{ letterSpacing: '2px', fontSize: '12px' }}>LOADING ACCOUNT DATA...</span>
      </div>
    );
  }

  if (error) {
    if (requiresAuth) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px', gap: '16px' }}>
          <div style={{ background: B.panel, border: `1px solid ${B.amber}`, padding: '24px', textAlign: 'center' }}>
            <p style={{ color: B.amber, marginBottom: '16px', letterSpacing: '1px' }}>{error}</p>
            <LoginButton />
          </div>
        </div>
      );
    }
    return (
      <div style={{ margin: '16px', padding: '12px 16px', background: B.panel, border: `1px solid ${B.red}` }}>
        <p style={{ color: B.red }}>ERROR: {error}</p>
        <button onClick={() => fetchData()} style={{ marginTop: '8px', padding: '6px 16px', background: B.red, color: 'var(--fg-000000)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
          RETRY
        </button>
      </div>
    );
  }

  const totalValue = positions.reduce((sum, p) => sum + p.totalValue, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.avgOpenPrice * p.quantity, 0);
  const totalGainLoss = positions.reduce((sum, p) => sum + p.gainLoss, 0);
  const totalReturn = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  // One row per deliberate position: a basket counts once, however many
  // fractional legs the broker reports underneath it.
  const rows: PortfolioRow[] = groupPositions(
    positions,
    baskets.filter(b => Boolean(b.isPaper) === isPaper),
  );




  // Windows the chart can show, sliced from the one year the API returns.
  const frame = TIMEFRAMES.find(t => t.id === timeframe) ?? TIMEFRAMES[1];
  const cutoff = new Date(Date.now() - frame.days * 86400000).toISOString().slice(0, 10);
  const series = portfolioHistory.filter(d => d.date >= cutoff);

  const windowFirst = series.length > 1 ? series[0].value : null;
  const windowLast = series.length > 1 ? series[series.length - 1].value : null;
  const windowChange = windowFirst !== null && windowLast !== null ? windowLast - windowFirst : null;
  const windowPct = windowChange !== null && windowFirst ? (windowChange / windowFirst) * 100 : null;
  const up = (windowChange ?? 0) >= 0;
  const trend = up ? B.green : B.red;

  // The headline is the account's own figure. The chart only reconstructs
  // today's holdings backwards, so it is a shape, not a second source of truth.
  const headline = balance?.netLiquidity ?? totalValue;

  const money = (v: number, dp = 2) =>
    `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

  const sub: React.CSSProperties = { color: B.label, fontSize: '11px', letterSpacing: '0.5px' };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 0 28px' }}>

      {/* Headline */}
      <div style={{ padding: '18px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ color: B.label, fontSize: '10px', letterSpacing: '2px' }}>
            {isPaper ? 'PAPER PORTFOLIO' : 'PORTFOLIO'}
          </span>
          {isPaper && (
            <span style={{
              background: 'var(--bg-002200)', border: '1px solid var(--bg-00ff41)', color: 'var(--fg-00ff41)',
              fontSize: '9px', fontWeight: 'bold', letterSpacing: '1.5px', padding: '1px 7px',
            }}>
              SIMULATED
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}><LoginButton /></span>
        </div>

        <div style={{
          color: B.text, fontSize: 'clamp(32px, 9vw, 44px)', fontWeight: 'bold',
          letterSpacing: '-0.5px', lineHeight: 1.05,
        }}>
          {money(headline)}
        </div>

        {windowChange !== null ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '7px', flexWrap: 'wrap' }}>
            <span style={{ color: trend, fontSize: '14px', fontWeight: 'bold' }}>
              {up ? '▲' : '▼'} {money(Math.abs(windowChange))} ({up ? '+' : '−'}{windowPct !== null ? Math.abs(windowPct).toFixed(2) : '0.00'}%)
            </span>
            <span style={sub}>{frame.label}</span>
          </div>
        ) : (
          <div style={{ ...sub, marginTop: '7px' }}>NOT ENOUGH HISTORY YET</div>
        )}
      </div>

      {/* Chart: no axes, no grid, no legend */}
      {series.length > 1 && (() => {
        const lo = Math.min(...series.map(d => d.value));
        const hi = Math.max(...series.map(d => d.value));
        const pad = (hi - lo) * 0.12 || hi * 0.02;
        return (
          <div style={{ height: isMobile ? 170 : 210, marginTop: '10px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trend} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={trend} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={[lo - pad, hi + pad]} hide />
                <Tooltip
                  cursor={{ stroke: B.label, strokeDasharray: '2 2' }}
                  contentStyle={{
                    background: 'var(--bg-0d0d0d)', border: `1px solid ${B.border}`,
                    fontFamily: 'Courier New, monospace', fontSize: '12px',
                  }}
                  labelStyle={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}
                  itemStyle={{ color: B.text, fontWeight: 'bold' }}
                  formatter={(v: number | undefined) => [v == null ? '—' : money(v), 'Value']}
                />
                <Area
                  type="monotone" dataKey="value" stroke={trend} strokeWidth={2}
                  fill="url(#pv)" dot={false} activeDot={{ r: 3, fill: trend }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Timeframe */}
      <div className="r-hscroll" style={{ display: 'flex', gap: '6px', padding: '10px 18px 0' }}>
        {TIMEFRAMES.map(t => {
          const on = t.id === timeframe;
          return (
            <button
              key={t.id}
              onClick={() => setTimeframe(t.id)}
              style={{
                background: on ? trend : 'transparent',
                color: on ? 'var(--bg-000000)' : B.label,
                border: `1px solid ${on ? trend : B.border}`,
                fontFamily: 'Courier New, monospace', fontWeight: 'bold',
                fontSize: '11px', letterSpacing: '1px', padding: '6px 13px',
                cursor: 'pointer', minWidth: '44px',
              }}
            >
              {t.id}
            </button>
          );
        })}
      </div>

      {/* Buying power */}
      <div style={{
        display: 'flex', gap: '28px', flexWrap: 'wrap',
        padding: '16px 18px', margin: '16px 0 0',
        borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}`,
      }}>
        <div>
          <div style={sub}>BUYING POWER</div>
          <div style={{ color: B.text, fontSize: '15px', fontWeight: 'bold', marginTop: '3px' }}>
            {money(balance?.buyingPower ?? 0)}
          </div>
        </div>
        <div>
          <div style={sub}>TOTAL RETURN</div>
          <div style={{ color: totalGainLoss >= 0 ? B.green : B.red, fontSize: '15px', fontWeight: 'bold', marginTop: '3px' }}>
            {totalGainLoss >= 0 ? '+' : '−'}{money(Math.abs(totalGainLoss))} ({totalReturn >= 0 ? '+' : '−'}{Math.abs(totalReturn).toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Positions */}
      <div style={{ padding: '18px 18px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
          <span style={{ color: B.amber, fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px' }}>POSITIONS</span>
          <span style={{ ...sub, fontSize: '10px' }}>{isMobile ? 'TAP TO TRADE' : 'CLICK TO TRADE'}</span>
        </div>
      </div>

      {positions.length === 0 ? (
        <p style={{ ...sub, padding: '14px 18px' }}>NO POSITIONS FOUND</p>
      ) : (
        <div>
          {rows.map(row => {
            if (row.kind === 'basket') {
              const isOpen = openBaskets[row.id];
              const pct = row.cost > 0 ? (row.gainLoss / row.cost) * 100 : 0;
              return (
                <React.Fragment key={'basket-' + row.id}>
                  <Row
                    onClick={() => setOpenBaskets(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                    title={`${isOpen ? '▼' : '▶'}  ${row.fundName.toUpperCase()}`}
                    subtitle={`BASKET · ${row.legs.length} ${row.legs.length === 1 ? 'POSITION' : 'POSITIONS'}`}
                    value={money(row.totalValue)}
                    change={row.gainLoss}
                    changePct={pct}
                    B={B}
                  />
                  {isOpen && row.legs.map(leg => {
                    const legPct = leg.entryPrice > 0 ? ((leg.currentPrice - leg.entryPrice) / leg.entryPrice) * 100 : 0;
                    return (
                      <Row
                        key={row.id + '-' + leg.symbol}
                        indented
                        onClick={() => router.push(`/stock/${leg.symbol}`)}
                        title={leg.symbol}
                        subtitle={`${leg.shares} · ${money(leg.entryPrice)}`}
                        value={money(leg.value)}
                        change={leg.gainLoss}
                        changePct={legPct}
                        B={B}
                      />
                    );
                  })}
                </React.Fragment>
              );
            }

            const p = row.position;
            const cost = p.avgOpenPrice * p.quantity;
            const pct = cost > 0 ? (p.gainLoss / cost) * 100 : 0;
            return (
              <Row
                key={p.symbol}
                onClick={() => setSelectedPosition(p)}
                title={p.symbol}
                subtitle={`${p.quantity} · ${money(p.currentPrice)}`}
                value={money(p.totalValue)}
                change={p.gainLoss}
                changePct={pct}
                B={B}
              />
            );
          })}
        </div>
      )}

      {selectedPosition && (
        <TradeModal
          symbol={selectedPosition.symbol}
          currentPrice={selectedPosition.currentPrice}
          maxSellQuantity={selectedPosition.quantity}
          isPaper={isPaper}
          onClose={() => setSelectedPosition(null)}
          onSuccess={() => { setSelectedPosition(null); if (userId) _caches.delete(userId); fetchData(); }}
        />
      )}
    </div>
  );
}

/**
 * One line of the holdings list: what it is on the left, what it is worth on
 * the right. Replaces an eight-column table that could not be read on a phone
 * and did not earn the space anywhere else.
 */
function Row({
  title, subtitle, value, change, changePct, onClick, indented, B,
}: {
  title: string;
  subtitle: string;
  value: string;
  change: number;
  changePct: number;
  onClick?: () => void;
  indented?: boolean;
  B: Record<string, string>;
}) {
  const up = change >= 0;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px',
        padding: indented ? '11px 18px 11px 34px' : '13px 18px',
        borderBottom: '1px solid var(--bg-1a1a1a)',
        cursor: onClick ? 'pointer' : 'default',
        background: indented ? 'var(--bg-050505)' : 'transparent',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--bg-0a0a0a)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = indented ? 'var(--bg-050505)' : 'transparent'; }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{
          color: indented ? B.amberDim : B.amber, fontWeight: 'bold',
          fontSize: indented ? '13px' : '14px', letterSpacing: '1px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {title}
        </div>
        <div style={{ color: B.label, fontSize: '11px', marginTop: '3px' }}>{subtitle}</div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ color: B.text, fontSize: '14px', fontWeight: 'bold' }}>{value}</div>
        <div style={{ color: up ? B.green : B.red, fontSize: '11px', marginTop: '3px', fontWeight: 'bold' }}>
          {up ? '+' : '−'}${Math.abs(change).toFixed(2)} ({up ? '+' : '−'}{Math.abs(changePct).toFixed(2)}%)
        </div>
      </div>
    </div>
  );
}
