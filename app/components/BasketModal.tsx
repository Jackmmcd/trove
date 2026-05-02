'use client';

import { useState, useEffect } from 'react';

interface Holding {
  ticker: string;
  shares: number;
  value: number;
  weight: number;
}

interface BasketLine {
  ticker: string;
  weight: number;
  price: number | null;
  sharesToBuy: number;
  dollarAmount: number;
  status: 'pending' | 'placing' | 'done' | 'error';
  error?: string;
}

interface BasketModalProps {
  fundId?: string;
  fundName: string;
  holdings: Holding[];
  onClose: () => void;
}

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', amberDim: '#cc6d00',
  green: '#00ff41', red: '#ff3333', cyan: '#00e5ff',
  label: '#888', text: '#e0e0e0',
};

export default function BasketModal({ fundId, fundName, holdings, onClose }: BasketModalProps) {
  const [budget, setBudget] = useState('1000');
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [step, setStep] = useState<'configure' | 'confirm' | 'placing' | 'done'>('configure');
  const [placedCount, setPlacedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const budgetNum = parseFloat(budget) || 0;
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);

  useEffect(() => {
    if (holdings.length === 0) return;
    const budget0 = 1000;
    const initialLines: BasketLine[] = holdings.map(h => {
      const weight = totalWeight > 0 ? (h.weight / totalWeight) * 100 : 0;
      return { ticker: h.ticker, weight, price: null, sharesToBuy: 0, dollarAmount: (budget0 * weight) / 100, status: 'pending' };
    });
    setLines(initialLines);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const symbols = holdings.map(h => h.ticker).join(',');
    fetch(`/api/tastytrade/quotes?symbols=${encodeURIComponent(symbols)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        const prices: Record<string, number> = data.success ? data.data : {};
        setLines(prev => prev.map(l => {
          const price = prices[l.ticker] ?? 0;
          return { ...l, price, sharesToBuy: price > 0 ? Math.round((l.dollarAmount / price) * 10000) / 10000 : 0 };
        }));
      })
      .catch(() => setLines(prev => prev.map(l => ({ ...l, price: 0 }))))
      .finally(() => { clearTimeout(timer); setLoadingPrices(false); });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [holdings]);

  useEffect(() => {
    setLines(prev => prev.map(l => {
      const dollarAmount = (budgetNum * l.weight) / 100;
      const sharesToBuy = (l.price ?? 0) > 0 ? Math.round((dollarAmount / (l.price as number)) * 10000) / 10000 : 0;
      return { ...l, dollarAmount, sharesToBuy };
    }));
  }, [budget]);

  async function placeAll() {
    setStep('placing');
    let placed = 0, errors = 0;
    for (const line of lines.filter(l => l.sharesToBuy > 0)) {
      setLines(prev => prev.map(l => l.ticker === line.ticker ? { ...l, status: 'placing' } : l));
      try {
        const res = await fetch('/api/tastytrade/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: line.ticker, quantity: line.sharesToBuy, action: 'buy' }),
        });
        const data = await res.json();
        if (data.success) { placed++; setLines(prev => prev.map(l => l.ticker === line.ticker ? { ...l, status: 'done' } : l)); }
        else throw new Error(data.error || 'Order failed');
      } catch (err: any) {
        errors++;
        setLines(prev => prev.map(l => l.ticker === line.ticker ? { ...l, status: 'error', error: err.message } : l));
      }
    }
    setPlacedCount(placed); setErrorCount(errors); setStep('done');

    // Record basket purchase for tracking
    if (placed > 0 && fundId) {
      const completedOrders = lines
        .filter(l => l.sharesToBuy > 0)
        .map(l => ({ ticker: l.ticker, shares: l.sharesToBuy, price: l.price ?? 0, status: l.status }));
      fetch('/api/baskets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId, fundName, budget: budgetNum, orders: completedOrders }),
      }).catch(() => {});
    }
  }

  const totalEstimated = lines.reduce((s, l) => s + l.sharesToBuy * (l.price ?? 0), 0);
  const buyableLines = lines.filter(l => l.sharesToBuy > 0);
  const uninvested = budgetNum - totalEstimated;

  const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' };
  const modalStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.amber}`, width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', fontFamily: 'Courier New, monospace' };
  const headerStyle: React.CSSProperties = { background: B.amber, color: '#000', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px', flexShrink: 0 };
  const thStyle: React.CSSProperties = { color: B.label, fontSize: '10px', letterSpacing: '1px', padding: '5px 10px', textAlign: 'left', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal', textTransform: 'uppercase' };
  const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid #111', fontSize: '12px', color: B.text };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <span>BUY BASKET — {fundName.toUpperCase()}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '18px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>

        {step === 'done' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '12px' }}>
            <div style={{ color: errorCount === 0 ? B.green : B.amber, fontSize: '40px' }}>{errorCount === 0 ? '✓' : '⚠'}</div>
            <p style={{ color: B.text, fontSize: '14px', letterSpacing: '1px' }}>
              {placedCount} ORDER{placedCount !== 1 ? 'S' : ''} PLACED{errorCount > 0 ? ` · ${errorCount} FAILED` : ''}
            </p>
            <div style={{ width: '100%', overflowY: 'auto', maxHeight: '180px' }}>
              {lines.filter(l => l.sharesToBuy > 0).map(l => (
                <div key={l.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #111', fontSize: '12px' }}>
                  <span style={{ color: B.amber }}>{l.ticker}</span>
                  <span style={{ color: l.status === 'done' ? B.green : l.status === 'error' ? B.red : B.label }}>
                    {l.status === 'done' ? `✓ ${l.sharesToBuy} SHS` : l.status === 'error' ? `✗ ${l.error}` : 'SKIPPED'}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={onClose} style={{ padding: '8px 32px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px' }}>
              DONE
            </button>
          </div>
        ) : (
          <>
            {/* Budget input */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${B.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>BUDGET $</span>
                  <input
                    type="number" min={0} step={100} value={budget}
                    onChange={e => setBudget(e.target.value)}
                    disabled={step !== 'configure'}
                    style={{ background: '#000', border: `1px solid ${B.amber}`, color: B.amber, padding: '5px 10px', fontSize: '16px', fontFamily: 'Courier New, monospace', width: '120px', outline: 'none' }}
                  />
                </div>
                {!loadingPrices && (
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <div>
                      <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>EST. DEPLOYED</div>
                      <div style={{ color: B.green, fontWeight: 'bold', fontSize: '13px' }}>${totalEstimated.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>UNINVESTED</div>
                      <div style={{ color: uninvested > 0 ? B.amber : B.label, fontWeight: 'bold', fontSize: '13px' }}>${uninvested.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>POSITIONS</div>
                      <div style={{ color: B.cyan, fontWeight: 'bold', fontSize: '13px' }}>{buyableLines.length}</div>
                    </div>
                  </div>
                )}
                {loadingPrices && <span style={{ color: B.label, fontSize: '11px', letterSpacing: '1px' }}>FETCHING PRICES...</span>}
              </div>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Ticker</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Weight</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>$ Alloc</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Shares</th>
                    {step === 'placing' && <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.ticker} style={{ opacity: l.sharesToBuy === 0 && !loadingPrices ? 0.3 : 1 }}>
                      <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold' }}>{l.ticker}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.label }}>{l.weight.toFixed(1)}%</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {l.price === null
                          ? <span style={{ color: B.label, fontSize: '10px' }}>...</span>
                          : l.price > 0
                          ? <span style={{ color: B.cyan }}>${l.price.toFixed(2)}</span>
                          : <span style={{ color: B.red, fontSize: '10px' }}>NO PRICE</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.text }}>${l.dollarAmount.toFixed(0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: l.sharesToBuy > 0 ? B.green : B.label }}>
                        {l.sharesToBuy > 0 ? l.sharesToBuy : '—'}
                      </td>
                      {step === 'placing' && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '10px' }}>
                          {l.status === 'placing' ? <span style={{ color: B.amber }}>PLACING...</span>
                            : l.status === 'done' ? <span style={{ color: B.green }}>✓ DONE</span>
                            : l.status === 'error' ? <span style={{ color: B.red }}>✗ ERR</span>
                            : l.sharesToBuy > 0 ? <span style={{ color: B.label }}>QUEUED</span>
                            : <span style={{ color: '#333' }}>—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${B.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <button onClick={onClose} style={{ padding: '7px 16px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' }}>
                CANCEL
              </button>
              {step === 'configure' && (
                <button onClick={() => setStep('confirm')} disabled={budgetNum <= 0 || loadingPrices}
                  style={{ padding: '7px 20px', background: budgetNum <= 0 || loadingPrices ? '#333' : B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px', opacity: budgetNum <= 0 || loadingPrices ? 0.5 : 1 }}>
                  {loadingPrices ? 'FETCHING PRICES...' : 'PREVIEW ORDERS'}
                </button>
              )}
              {step === 'confirm' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => setStep('configure')} style={{ padding: '7px 14px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' }}>
                    BACK
                  </button>
                  <button onClick={placeAll} disabled={buyableLines.length === 0}
                    style={{ padding: '7px 20px', background: buyableLines.length === 0 ? '#333' : B.green, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px', opacity: buyableLines.length === 0 ? 0.5 : 1 }}>
                    PLACE {buyableLines.length} ORDERS
                  </button>
                </div>
              )}
              {step === 'placing' && <span style={{ color: B.amber, fontSize: '11px', letterSpacing: '2px' }}>PLACING ORDERS...</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
