'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const AMBER = '#ff8c00';
const DIM = '#666';

interface Holder {
  fund: string; entity_type: string; quarter: string;
  weight: number; value: number; first_reported: string;
}

interface PanelData {
  ticker: string;
  analysis?: {
    summary?: string; bull_case?: string; bear_case?: string; error?: string;
    name?: string; sector?: string;
    fundamentals?: {
      name?: string; sector?: string | null;
      market_cap_display?: string | null;
      shares_outstanding?: number | null;
      employees?: number | null;
      listed?: string | null;
    } | null;
  };
  holders?: { fund_count?: number; funds_tracked?: number; aggregate_equity_weight?: number; holders?: Holder[] };
  position?: { quantity: number; avg_open_price: number } | null;
}

function bullets(raw?: string): string[] {
  if (!raw) return [];
  return raw.split('\n').map(l => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: DIM, fontSize: '9.5px', letterSpacing: '1.5px', marginBottom: '7px' }}>{children}</div>
);

export default function TickerPanel({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setData(null); setError(null);
    fetch(`/api/advisor/stock?ticker=${encodeURIComponent(ticker)}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
        return j;
      })
      .then(j => { if (!cancelled) setData(j); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // Escape closes, matching the rest of the app's keyboard behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const a = data?.analysis;
  const f = a?.fundamentals;
  const holders = data?.holders?.holders ?? [];

  return (
    <>
      {/* Scrim — mobile only; on desktop the panel sits beside the conversation */}
      <div
        onClick={onClose}
        className="ticker-panel-scrim"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 90 }}
      />

      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(400px, 100vw)',
          background: '#0a0a0a', borderLeft: `1px solid ${AMBER}`, zIndex: 91,
          overflowY: 'auto', fontFamily: 'Courier New, monospace',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid #1a1a1a',
          position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1,
        }}>
          <div>
            <div style={{ color: AMBER, fontSize: '19px', fontWeight: 900, letterSpacing: '2px' }}>{ticker}</div>
            {(f?.name || a?.name) && (
              <div style={{ color: '#999', fontSize: '11px', marginTop: '3px' }}>{f?.name ?? a?.name}</div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: '1px solid #2a2a2a', color: DIM,
            fontFamily: 'inherit', fontSize: '13px', lineHeight: 1,
            padding: '6px 10px', cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          {loading && <div style={{ color: DIM, fontSize: '12px' }}>loading…</div>}
          {error && <div style={{ color: '#e07a5a', fontSize: '12px', lineHeight: 1.6 }}>{error}</div>}

          {!loading && !error && (
            <>
              {(f?.market_cap_display || f?.sector || a?.sector) && (
                <div>
                  <Label>SNAPSHOT</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 14px', fontSize: '12px' }}>
                    {f?.market_cap_display && (<><span style={{ color: DIM }}>Market cap</span><span style={{ color: '#ffb454' }}>{f.market_cap_display}</span></>)}
                    {(f?.sector ?? a?.sector) && (<><span style={{ color: DIM }}>Sector</span><span style={{ color: '#ddd' }}>{f?.sector ?? a?.sector}</span></>)}
                    {f?.employees ? (<><span style={{ color: DIM }}>Employees</span><span style={{ color: '#ddd' }}>{f.employees.toLocaleString()}</span></>) : null}
                    {f?.listed && (<><span style={{ color: DIM }}>Listed</span><span style={{ color: '#ddd' }}>{f.listed}</span></>)}
                  </div>
                </div>
              )}

              {data?.position && (
                <div style={{ border: '1px solid #2a2a00', background: '#0e0e04', padding: '10px 12px' }}>
                  <Label>YOUR POSITION</Label>
                  <div style={{ color: '#ddd', fontSize: '12px' }}>
                    {data.position.quantity} shares @ ${data.position.avg_open_price.toFixed(2)} avg
                  </div>
                </div>
              )}

              {a?.summary && (
                <div>
                  <Label>WHAT IT DOES</Label>
                  <p style={{ color: '#e8e2d8', fontSize: '13px', lineHeight: 1.65, margin: 0, fontFamily: 'Georgia, serif' }}>
                    {a.summary}
                  </p>
                </div>
              )}

              {bullets(a?.bull_case).length > 0 && (
                <div>
                  <Label>CASE FOR</Label>
                  <ul style={{ margin: 0, paddingLeft: '16px', color: '#7fbf9a', fontSize: '12px', lineHeight: 1.6 }}>
                    {bullets(a?.bull_case).map((b, i) => <li key={i} style={{ marginBottom: '5px' }}>{b}</li>)}
                  </ul>
                </div>
              )}

              {bullets(a?.bear_case).length > 0 && (
                <div>
                  <Label>CASE AGAINST</Label>
                  <ul style={{ margin: 0, paddingLeft: '16px', color: '#d98b6f', fontSize: '12px', lineHeight: 1.6 }}>
                    {bullets(a?.bear_case).map((b, i) => <li key={i} style={{ marginBottom: '5px' }}>{b}</li>)}
                  </ul>
                </div>
              )}

              {a?.error && !a?.summary && (
                <div style={{ color: '#8a8070', fontSize: '12px', lineHeight: 1.6 }}>
                  No company profile available for {ticker}.
                </div>
              )}

              <div>
                <Label>
                  HELD BY {data?.holders?.fund_count ?? holders.length}{data?.holders?.funds_tracked ? ` OF ${data.holders.funds_tracked}` : ''} FUNDS
                  {data?.holders?.aggregate_equity_weight ? ` · ${data.holders.aggregate_equity_weight.toFixed(1)}% AGGREGATE` : ''}
                </Label>
                {holders.length === 0 ? (
                  <div style={{ color: '#8a8070', fontSize: '12px' }}>No tracked fund reports this ticker.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {holders.map((h, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', gap: '10px',
                        borderBottom: i < holders.length - 1 ? '1px solid #161616' : 'none',
                        paddingBottom: '6px', fontSize: '11.5px',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.fund}</div>
                          <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>
                            {h.entity_type.replace(/_/g, ' ')} · since {h.first_reported}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ color: AMBER }}>{h.weight.toFixed(2)}%</div>
                          <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>{h.quarter}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link href={`/stock/${ticker}`} style={{
                display: 'block', textAlign: 'center', marginTop: 'auto',
                border: `1px solid ${AMBER}`, color: AMBER, textDecoration: 'none',
                fontSize: '11px', letterSpacing: '1.5px', padding: '9px',
              }}>
                FULL STOCK PAGE →
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
