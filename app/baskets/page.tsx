'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '../components/Navigation';
import BasketSellModal from '../components/BasketSellModal';

const B = {
  bg: 'var(--bg-000000)', panel: 'var(--bg-0d0d0d)', border: 'var(--bg-2a2a2a)',
  amber: 'var(--bg-ff8c00)', green: 'var(--bg-00ff41)', red: 'var(--bg-ff3333)', cyan: 'var(--bg-00e5ff)',
  label: 'var(--fg-888888)', text: 'var(--fg-e0e0e0)',
};

interface Order {
  ticker: string;
  shares: number;
  price: number; // entry price
  status: string;
  currentPrice?: number;
}

interface Basket {
  id: string;
  fundName: string;
  fundId: string;
  budget: number;
  placedAt: string;
  orders: Order[];
  isPaper?: boolean;
  soldAt?: string | null;
  saleOrders?: Order[];
}

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

export default function BasketsPage() {
  const router = useRouter();
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selling, setSelling] = useState<Basket | null>(null);

  function load() {
    fetch('/api/baskets')
      .then(r => r.json())
      .then(async d => {
        if (!d.success) return;
        const raw: Basket[] = d.data.map((b: any) => ({
          ...b,
          orders: typeof b.orders === 'string' ? JSON.parse(b.orders) : b.orders,
        }));

        // Collect all unique tickers
        const allTickers = [...new Set(raw.flatMap(b => b.orders.filter((o: Order) => o.status === 'done').map((o: Order) => o.ticker)))];

        // Fetch current prices
        let prices: Record<string, number> = {};
        if (allTickers.length > 0) {
          try {
            const res = await fetch(`/api/tastytrade/quotes?symbols=${encodeURIComponent(allTickers.join(','))}`);
            const qd = await res.json();
            if (qd.success) prices = qd.data;
          } catch {}
        }

        // Attach current prices to orders
        const enriched = raw.map(b => ({
          ...b,
          orders: b.orders.map((o: Order) => ({ ...o, currentPrice: prices[o.ticker] ?? o.price })),
        }));

        setBaskets(enriched);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const panelStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.border}`, fontFamily: 'Courier New, monospace' };

  return (
    <div style={{ minHeight: '100vh', background: B.bg, fontFamily: 'Courier New, monospace' }}>
      <Navigation />
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', color: B.amber, letterSpacing: '2px' }}>
          LOADING BASKETS...
        </div>
      ) : baskets.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: B.label, letterSpacing: '2px', fontSize: '12px' }}>NO BASKETS PURCHASED YET</p>
          <p style={{ color: 'var(--fg-444444)', fontSize: '11px', marginTop: '8px' }}>Buy a basket from the FUNDS page to start tracking performance.</p>
        </div>
      ) : (
      <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>

      <div style={{ color: B.amber, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>BASKET TRACKER</div>

      {baskets.map(basket => {
        const doneOrders = basket.orders.filter(o => o.status === 'done');
        const costBasis = doneOrders.reduce((s, o) => s + o.shares * o.price, 0);
        const isSold = Boolean(basket.soldAt);

        // A closed basket is valued at what it actually sold for, not at
        // today's price — the position no longer moves with the market, and
        // showing a live number against it would be fiction.
        const saleOrders = (basket.saleOrders ?? []).filter(o => o.status === 'done');
        const currentValue = isSold
          ? saleOrders.reduce((s, o) => s + o.shares * o.price, 0)
          : doneOrders.reduce((s, o) => s + o.shares * (o.currentPrice ?? o.price), 0);
        const pnl = currentValue - costBasis;
        const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
        const isUp = pnl >= 0;
        const isOpen = expanded[basket.id];

        return (
          <div key={basket.id} style={isSold ? { ...panelStyle, opacity: 0.62 } : panelStyle}>
            {/* Basket header — always visible */}
            <div
              onClick={() => setExpanded(prev => ({ ...prev, [basket.id]: !prev[basket.id] }))}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', flexWrap: 'wrap' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-111111)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Expand toggle */}
              <span style={{ color: B.amber, fontSize: '12px', width: '14px' }}>{isOpen ? '▼' : '▶'}</span>

              {/* Fund name */}
              <div style={{ flex: 1, minWidth: '160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ color: B.amber, fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px' }}>{basket.fundName.toUpperCase()}</span>
                  {isSold && (
                    <span style={{ color: B.label, fontSize: '9px', letterSpacing: '2px', border: `1px solid ${B.border}`, padding: '1px 6px' }}>CLOSED</span>
                  )}
                </div>
                <div style={{ color: 'var(--fg-444444)', fontSize: '10px', marginTop: '2px' }}>
                  {timeAgo(basket.placedAt)} · {doneOrders.length} positions
                  {isSold && basket.soldAt ? ` · sold ${timeAgo(basket.soldAt)}` : ''}
                </div>
              </div>

              {/* Cost basis */}
              <div style={{ textAlign: 'right', minWidth: '90px' }}>
                <div style={{ color: B.label, fontSize: '9px', letterSpacing: '1px' }}>COST BASIS</div>
                <div style={{ color: B.text, fontSize: '13px' }}>{fmt$(costBasis)}</div>
              </div>

              {/* Current value, or what it closed at */}
              <div style={{ textAlign: 'right', minWidth: '100px' }}>
                <div style={{ color: B.label, fontSize: '9px', letterSpacing: '1px' }}>{isSold ? 'PROCEEDS' : 'CURRENT VALUE'}</div>
                <div style={{ color: B.cyan, fontSize: '13px' }}>{fmt$(currentValue)}</div>
              </div>

              {/* P&L */}
              <div style={{ textAlign: 'right', minWidth: '100px' }}>
                <div style={{ color: B.label, fontSize: '9px', letterSpacing: '1px' }}>{isSold ? 'REALISED P&L' : 'P&L'}</div>
                <div style={{ color: isUp ? B.green : B.red, fontSize: '14px', fontWeight: 'bold' }}>
                  {isUp ? '+' : ''}{fmt$(pnl)}
                </div>
                <div style={{ color: isUp ? B.green : B.red, fontSize: '10px' }}>{fmtPct(pnlPct)}</div>
              </div>

              {/* Sell the whole basket. Stops the click bubbling to the row's
                  expand toggle, which would otherwise fire underneath it. */}
              <div style={{ minWidth: '92px', textAlign: 'right' }}>
                {!isSold && doneOrders.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setSelling(basket); }}
                    style={{ padding: '6px 12px', background: 'transparent', color: B.red, border: `1px solid ${B.red}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '10px', letterSpacing: '1.5px', fontWeight: 'bold' }}
                    onMouseEnter={e => { e.currentTarget.style.background = B.red; e.currentTarget.style.color = 'var(--fg-000000)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = B.red; }}
                  >
                    SELL
                  </button>
                )}
              </div>
            </div>

            {/* Positions table — expanded */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${B.border}` }}>
                <table className="r-cards" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['TICKER', 'SHARES', 'ENTRY', isSold ? 'EXIT' : 'CURRENT', 'COST', isSold ? 'PROCEEDS' : 'VALUE', 'P&L', 'RETURN'].map(h => (
                        <th key={h} style={{ color: B.label, fontSize: '9px', letterSpacing: '1px', padding: '6px 14px', textAlign: h === 'TICKER' ? 'left' : 'right', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doneOrders.map(o => {
                      const soldLeg = saleOrders.find(sl => sl.ticker === o.ticker);
                      const exitPrice = isSold && soldLeg ? soldLeg.price : (o.currentPrice ?? o.price);
                      const cost = o.shares * o.price;
                      const val = o.shares * exitPrice;
                      const gain = val - cost;
                      const gainPct = cost > 0 ? gain / cost : 0;
                      const up = gain >= 0;
                      return (
                        <tr
                          key={o.ticker}
                          onClick={() => router.push(`/stock/${o.ticker}`)}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-111111)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td data-head="" data-label="Ticker" style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', color: B.amber, fontWeight: 'bold', fontSize: '12px' }}>{o.ticker}</td>
                          <td data-label="Shares" style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', textAlign: 'right', fontSize: '12px', color: B.text }}>{o.shares}</td>
                          <td data-label="Entry" style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', textAlign: 'right', fontSize: '12px', color: B.label }}>{fmt$(o.price)}</td>
                          <td data-label={isSold ? 'Exit' : 'Current'} style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', textAlign: 'right', fontSize: '12px', color: B.cyan }}>{fmt$(exitPrice)}</td>
                          <td data-label="Cost" style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', textAlign: 'right', fontSize: '12px', color: B.text }}>{fmt$(cost)}</td>
                          <td data-label="Value" style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', textAlign: 'right', fontSize: '12px', color: B.cyan }}>{fmt$(val)}</td>
                          <td data-label="P&L" style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', textAlign: 'right', fontSize: '12px', color: up ? B.green : B.red, fontWeight: 'bold' }}>{up ? '+' : ''}{fmt$(gain)}</td>
                          <td data-label="Return" style={{ padding: '7px 14px', borderBottom: '1px solid var(--bg-111111)', textAlign: 'right', fontSize: '12px', color: up ? B.green : B.red }}>{fmtPct(gainPct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `1px solid ${B.border}` }}>
                      <td colSpan={4} style={{ padding: '7px 14px', color: B.label, fontSize: '10px', letterSpacing: '1px' }}>TOTAL</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', color: B.text, fontSize: '12px' }}>{fmt$(costBasis)}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', color: B.cyan, fontSize: '12px' }}>{fmt$(currentValue)}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', color: isUp ? B.green : B.red, fontWeight: 'bold', fontSize: '13px' }}>{isUp ? '+' : ''}{fmt$(pnl)}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', color: isUp ? B.green : B.red, fontSize: '12px' }}>{fmtPct(pnlPct)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
      )}

      {selling && (
        <BasketSellModal
          basketId={selling.id}
          fundName={selling.fundName}
          isPaper={selling.isPaper}
          legs={selling.orders
            .filter(o => o.status === 'done' && o.shares > 0)
            .map(o => ({
              ticker: o.ticker,
              shares: o.shares,
              entryPrice: o.price,
              currentPrice: o.currentPrice ?? o.price,
            }))}
          onClose={() => setSelling(null)}
          onSold={() => { setSelling(null); setLoading(true); load(); }}
        />
      )}
    </div>
  );
}
