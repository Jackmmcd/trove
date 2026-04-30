'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', green: '#00ff41', red: '#ff3333', cyan: '#00e5ff',
  label: '#888', text: '#e0e0e0',
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

  useEffect(() => {
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
  }, []);

  const panelStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.border}`, fontFamily: 'Courier New, monospace' };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', color: B.amber, fontFamily: 'Courier New, monospace', letterSpacing: '2px' }}>
      LOADING BASKETS...
    </div>
  );

  if (baskets.length === 0) return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Courier New, monospace' }}>
      <p style={{ color: B.label, letterSpacing: '2px', fontSize: '12px' }}>NO BASKETS PURCHASED YET</p>
      <p style={{ color: '#444', fontSize: '11px', marginTop: '8px' }}>Buy a basket from the FUNDS page to start tracking performance.</p>
    </div>
  );

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'Courier New, monospace' }}>

      <div style={{ color: B.amber, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>BASKET TRACKER</div>

      {baskets.map(basket => {
        const doneOrders = basket.orders.filter(o => o.status === 'done');
        const costBasis = doneOrders.reduce((s, o) => s + o.shares * o.price, 0);
        const currentValue = doneOrders.reduce((s, o) => s + o.shares * (o.currentPrice ?? o.price), 0);
        const pnl = currentValue - costBasis;
        const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
        const isUp = pnl >= 0;
        const isOpen = expanded[basket.id];

        return (
          <div key={basket.id} style={panelStyle}>
            {/* Basket header — always visible */}
            <div
              onClick={() => setExpanded(prev => ({ ...prev, [basket.id]: !prev[basket.id] }))}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', flexWrap: 'wrap' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#111')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Expand toggle */}
              <span style={{ color: B.amber, fontSize: '12px', width: '14px' }}>{isOpen ? '▼' : '▶'}</span>

              {/* Fund name */}
              <div style={{ flex: 1, minWidth: '160px' }}>
                <div style={{ color: B.amber, fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px' }}>{basket.fundName.toUpperCase()}</div>
                <div style={{ color: '#444', fontSize: '10px', marginTop: '2px' }}>{timeAgo(basket.placedAt)} · {doneOrders.length} positions</div>
              </div>

              {/* Cost basis */}
              <div style={{ textAlign: 'right', minWidth: '90px' }}>
                <div style={{ color: B.label, fontSize: '9px', letterSpacing: '1px' }}>COST BASIS</div>
                <div style={{ color: B.text, fontSize: '13px' }}>{fmt$(costBasis)}</div>
              </div>

              {/* Current value */}
              <div style={{ textAlign: 'right', minWidth: '100px' }}>
                <div style={{ color: B.label, fontSize: '9px', letterSpacing: '1px' }}>CURRENT VALUE</div>
                <div style={{ color: B.cyan, fontSize: '13px' }}>{fmt$(currentValue)}</div>
              </div>

              {/* P&L */}
              <div style={{ textAlign: 'right', minWidth: '100px' }}>
                <div style={{ color: B.label, fontSize: '9px', letterSpacing: '1px' }}>P&L</div>
                <div style={{ color: isUp ? B.green : B.red, fontSize: '14px', fontWeight: 'bold' }}>
                  {isUp ? '+' : ''}{fmt$(pnl)}
                </div>
                <div style={{ color: isUp ? B.green : B.red, fontSize: '10px' }}>{fmtPct(pnlPct)}</div>
              </div>
            </div>

            {/* Positions table — expanded */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${B.border}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['TICKER', 'SHARES', 'ENTRY', 'CURRENT', 'COST', 'VALUE', 'P&L', 'RETURN'].map(h => (
                        <th key={h} style={{ color: B.label, fontSize: '9px', letterSpacing: '1px', padding: '6px 14px', textAlign: h === 'TICKER' ? 'left' : 'right', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doneOrders.map(o => {
                      const cost = o.shares * o.price;
                      const val = o.shares * (o.currentPrice ?? o.price);
                      const gain = val - cost;
                      const gainPct = cost > 0 ? gain / cost : 0;
                      const up = gain >= 0;
                      return (
                        <tr
                          key={o.ticker}
                          onClick={() => router.push(`/stock/${o.ticker}`)}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#111')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', color: B.amber, fontWeight: 'bold', fontSize: '12px' }}>{o.ticker}</td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '12px', color: B.text }}>{o.shares}</td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '12px', color: B.label }}>{fmt$(o.price)}</td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '12px', color: B.cyan }}>{fmt$(o.currentPrice ?? o.price)}</td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '12px', color: B.text }}>{fmt$(cost)}</td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '12px', color: B.cyan }}>{fmt$(val)}</td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '12px', color: up ? B.green : B.red, fontWeight: 'bold' }}>{up ? '+' : ''}{fmt$(gain)}</td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '12px', color: up ? B.green : B.red }}>{fmtPct(gainPct)}</td>
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
  );
}
