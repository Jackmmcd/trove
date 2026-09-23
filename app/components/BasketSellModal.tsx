'use client';

import { useState } from 'react';

/**
 * Closing a basket in one action.
 *
 * Mirrors BasketModal deliberately — same three steps, same sequential
 * placement, same per-leg status — because the two are the same operation in
 * opposite directions and a user who has bought one basket should not have to
 * learn a second flow to close it.
 *
 * Legs are sold at whatever the position is now, not at the shares originally
 * bought: a basket that has since been trimmed by hand should close out what is
 * actually there. The caller passes the clamped quantities.
 */

interface SellLine {
  ticker: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  status: 'pending' | 'placing' | 'done' | 'error';
  error?: string;
}

interface BasketSellModalProps {
  basketId: string;
  fundName: string;
  legs: Array<{ ticker: string; shares: number; entryPrice: number; currentPrice: number }>;
  isPaper?: boolean;
  onClose: () => void;
  onSold: () => void;
}

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', green: '#00ff41', red: '#ff3333', cyan: '#00e5ff',
  label: '#888', text: '#e0e0e0',
};

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BasketSellModal({
  basketId, fundName, legs, isPaper = false, onClose, onSold,
}: BasketSellModalProps) {
  const [lines, setLines] = useState<SellLine[]>(
    legs.map(l => ({ ...l, status: 'pending' as const })),
  );
  const [step, setStep] = useState<'confirm' | 'placing' | 'done'>('confirm');
  const [soldCount, setSoldCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  const cost = lines.reduce((s, l) => s + l.shares * l.entryPrice, 0);
  const proceeds = lines.reduce((s, l) => s + l.shares * l.currentPrice, 0);
  const pnl = proceeds - cost;
  const pnlPct = cost > 0 ? pnl / cost : 0;
  const isUp = pnl >= 0;

  async function sellAll() {
    setStep('placing');
    let sold = 0, errors = 0;
    const saleOrders: Array<{ ticker: string; shares: number; price: number; status: string }> = [];
    const endpoint = isPaper ? '/api/paper/order' : '/api/tastytrade/orders';

    for (const line of lines) {
      setLines(prev => prev.map(l => l.ticker === line.ticker ? { ...l, status: 'placing' } : l));
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: line.ticker, quantity: line.shares, action: 'sell' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Order failed');
        sold++;
        setLines(prev => prev.map(l => l.ticker === line.ticker ? { ...l, status: 'done' } : l));
        saleOrders.push({ ticker: line.ticker, shares: line.shares, price: line.currentPrice, status: 'done' });
      } catch (err: any) {
        errors++;
        setLines(prev => prev.map(l => l.ticker === line.ticker ? { ...l, status: 'error', error: err.message } : l));
        saleOrders.push({ ticker: line.ticker, shares: line.shares, price: line.currentPrice, status: 'error' });
      }
    }

    setSoldCount(sold); setErrorCount(errors); setStep('done');

    // Only close the basket if every leg went through. A partial close left
    // marked sold would strand the remaining shares: no longer inside a basket,
    // and no longer sellable as one.
    if (sold > 0 && errors === 0) {
      // The shares are gone either way. If the basket cannot be stamped closed
      // the user has to know, or it keeps showing an open position they no
      // longer hold — a silent catch here is the one failure that would lie.
      try {
        const res = await fetch('/api/baskets', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: basketId, saleOrders }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.success) setRecordError(data.error || `HTTP ${res.status}`);
      } catch (err: any) {
        setRecordError(err.message || 'Network error');
      }
    }
  }

  const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' };
  const modalStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.red}`, width: '100%', maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', fontFamily: 'Courier New, monospace' };
  const headerStyle: React.CSSProperties = { background: B.red, color: '#000', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px', flexShrink: 0 };
  const thStyle: React.CSSProperties = { color: B.label, fontSize: '10px', letterSpacing: '1px', padding: '5px 10px', textAlign: 'left', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal', textTransform: 'uppercase' };
  const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid #111', fontSize: '12px', color: B.text };

  return (
    <div className="sheet-overlay" style={overlayStyle}>
      <div className="sheet" style={modalStyle}>
        <div style={headerStyle}>
          <span>{isPaper ? '📄 PAPER ' : ''}SELL BASKET — {fundName.toUpperCase()}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '18px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>

        {step === 'done' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '12px' }}>
            <div style={{ color: errorCount === 0 ? B.green : B.amber, fontSize: '40px' }}>{errorCount === 0 ? '✓' : '⚠'}</div>
            <p style={{ color: B.text, fontSize: '14px', letterSpacing: '1px' }}>
              {soldCount} LEG{soldCount !== 1 ? 'S' : ''} SOLD{errorCount > 0 ? ` · ${errorCount} FAILED` : ''}
            </p>
            {recordError && (
              <p style={{ color: B.red, fontSize: '11px', lineHeight: 1.7, textAlign: 'center', maxWidth: '440px' }}>
                SOLD, BUT THE BASKET COULD NOT BE MARKED CLOSED: {recordError.toUpperCase()}.
                THE SHARES HAVE BEEN SOLD — THE BASKET WILL KEEP SHOWING AS OPEN UNTIL THIS IS FIXED.
              </p>
            )}
            {errorCount > 0 && (
              <p style={{ color: B.amber, fontSize: '11px', lineHeight: 1.7, textAlign: 'center', maxWidth: '420px' }}>
                THE BASKET IS STILL OPEN BECAUSE NOT EVERY LEG CLOSED. SELL THE REMAINING
                POSITIONS INDIVIDUALLY, OR RETRY — LEGS ALREADY SOLD WILL SIMPLY BE SKIPPED.
              </p>
            )}
            <div style={{ width: '100%', overflowY: 'auto', maxHeight: '180px' }}>
              {lines.map(l => (
                <div key={l.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #111', fontSize: '12px' }}>
                  <span style={{ color: B.amber }}>{l.ticker}</span>
                  <span style={{ color: l.status === 'done' ? B.green : l.status === 'error' ? B.red : B.label }}>
                    {l.status === 'done' ? `✓ ${l.shares} SHS` : l.status === 'error' ? `✗ ${l.error}` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={onSold} style={{ padding: '8px 32px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px' }}>
              DONE
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${B.border}`, flexShrink: 0, display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>POSITIONS</div>
                <div style={{ color: B.cyan, fontWeight: 'bold', fontSize: '13px' }}>{lines.length}</div>
              </div>
              <div>
                <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>COST BASIS</div>
                <div style={{ color: B.text, fontWeight: 'bold', fontSize: '13px' }}>{fmt$(cost)}</div>
              </div>
              <div>
                <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>EST. PROCEEDS</div>
                <div style={{ color: B.cyan, fontWeight: 'bold', fontSize: '13px' }}>{fmt$(proceeds)}</div>
              </div>
              <div>
                <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>REALISED P&L</div>
                <div style={{ color: isUp ? B.green : B.red, fontWeight: 'bold', fontSize: '13px' }}>
                  {isUp ? '+' : ''}{fmt$(pnl)} ({(pnlPct * 100).toFixed(2)}%)
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Ticker</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Shares</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Entry</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Last</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Proceeds</th>
                    {step === 'placing' && <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.ticker}>
                      <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold' }}>{l.ticker}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{l.shares}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.label }}>{fmt$(l.entryPrice)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.cyan }}>{fmt$(l.currentPrice)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt$(l.shares * l.currentPrice)}</td>
                      {step === 'placing' && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '10px' }}>
                          {l.status === 'placing' ? <span style={{ color: B.amber }}>SELLING...</span>
                            : l.status === 'done' ? <span style={{ color: B.green }}>✓ SOLD</span>
                            : l.status === 'error' ? <span style={{ color: B.red }}>✗ ERR</span>
                            : <span style={{ color: B.label }}>QUEUED</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${B.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <button onClick={onClose} disabled={step === 'placing'}
                style={{ padding: '7px 16px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: step === 'placing' ? 'default' : 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px', opacity: step === 'placing' ? 0.5 : 1 }}>
                CANCEL
              </button>
              {step === 'confirm' ? (
                <button onClick={sellAll} disabled={lines.length === 0}
                  style={{ padding: '7px 20px', background: lines.length === 0 ? '#333' : B.red, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' }}>
                  SELL ALL {lines.length} POSITIONS
                </button>
              ) : (
                <span style={{ color: B.amber, fontSize: '11px', letterSpacing: '2px' }}>PLACING SELLS...</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
