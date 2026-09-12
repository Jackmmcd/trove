'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navigation from '@/app/components/Navigation';

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', label: '#888', dim: '#666', text: '#e0e0e0',
};

interface Holder {
  fund: string; entity_type: string; quarter: string;
  weight: number; value: number; first_reported: string;
}

interface CompanyData {
  ticker: string;
  analysis?: {
    summary?: string; bull_case?: string; bear_case?: string;
    description?: string; error?: string;
    name?: string; sector?: string | null;
    fundamentals?: {
      name?: string; sector?: string | null;
      market_cap_display?: string | null;
      shares_outstanding?: number | null;
      employees?: number | null;
      listed?: string | null;
    } | null;
  };
  holders?: {
    fund_count?: number; funds_tracked?: number;
    aggregate_equity_weight?: number; holders?: Holder[];
  };
  position?: { quantity: number; avg_open_price: number } | null;
}

function bullets(raw?: string): string[] {
  if (!raw) return [];
  return raw.split('\n').map(l => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
}

function money(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: B.dim, fontSize: '9.5px', letterSpacing: '2px', marginBottom: '10px' }}>{children}</div>
);

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: B.panel, border: `1px solid ${B.border}`, padding: '16px 18px' }}>{children}</div>
);

export default function CompanyPage() {
  const params = useParams();
  const ticker = String(params?.ticker ?? '').toUpperCase();

  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true); setError(null); setNeedsAuth(false);

    // Reuses the Analyst side-panel endpoint verbatim rather than re-deriving
    // the analysis here, so a company reads identically wherever it is opened.
    fetch(`/api/advisor/stock?ticker=${encodeURIComponent(ticker)}`)
      .then(async r => {
        // Signed out, the request is either rejected by the route (401) or
        // bounced to /login by the proxy — both mean the same thing here.
        if (r.status === 401 || r.redirected) {
          if (!cancelled) setNeedsAuth(true);
          return null;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
        return j as CompanyData;
      })
      .then(j => { if (j && !cancelled) setData(j); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [ticker]);

  const a = data?.analysis;
  const f = a?.fundamentals;
  const name = f?.name ?? a?.name ?? '';
  const sector = f?.sector ?? a?.sector ?? null;
  const holders = data?.holders?.holders ?? [];

  const stats: [string, string][] = [];
  if (f?.market_cap_display) stats.push(['MARKET CAP', f.market_cap_display]);
  if (sector) stats.push(['SECTOR', sector]);
  if (f?.employees) stats.push(['EMPLOYEES', f.employees.toLocaleString()]);
  if (f?.listed) stats.push(['LISTED', f.listed]);
  if (f?.shares_outstanding) stats.push(['SHARES OUT', f.shares_outstanding.toLocaleString()]);
  // Fall back to counting the rows we were given rather than trusting a single
  // count field. A renamed field silently became `?? 0`, so the page confidently
  // read "held by 0" above a table listing six funds.
  const heldBy = data?.holders?.fund_count ?? holders.length;
  const trackedTotal = data?.holders?.funds_tracked;
  stats.push(['TRACKED HOLDERS', trackedTotal ? `${heldBy} / ${trackedTotal}` : String(heldBy)]);

  return (
    <div style={{ minHeight: '100vh', background: B.bg, color: B.text, fontFamily: 'Courier New, monospace' }}>
      <Navigation />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '22px 20px 60px' }}>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h1 style={{ color: B.amber, fontSize: '30px', fontWeight: 900, letterSpacing: '4px', margin: 0 }}>{ticker}</h1>
          {name && <span style={{ color: '#bbb', fontSize: '14px' }}>{name}</span>}
        </div>
        <div style={{ color: '#444', fontSize: '10px', letterSpacing: '2px', marginBottom: '22px' }}>
          COMPANY OVERVIEW · 13F HOLDERS
          {' · '}
          <Link href={`/stock/${ticker}`} style={{ color: B.amber, textDecoration: 'none' }}>PRICE &amp; FUNDAMENTALS →</Link>
        </div>

        {loading && (
          <div style={{ padding: '60px 0', color: B.amber, fontSize: '12px', letterSpacing: '2px' }}>
            LOADING {ticker}…
          </div>
        )}

        {needsAuth && (
          <Panel>
            <Label>SIGN IN TO VIEW</Label>
            <p style={{ color: '#bbb', fontSize: '13px', lineHeight: 1.7, margin: '0 0 16px', maxWidth: '58ch' }}>
              The company overview draws on the funds you track and your own positions,
              so it needs an account. Sign in and this page will load.
            </p>
            <Link href="/login" style={{
              display: 'inline-block', border: `1px solid ${B.amber}`, color: B.amber,
              textDecoration: 'none', fontSize: '11px', letterSpacing: '2px', padding: '9px 22px',
            }}>
              SIGN IN
            </Link>
          </Panel>
        )}

        {error && !needsAuth && (
          <div style={{
            border: '1px solid #3a1010', background: '#140606', color: '#e07a5a',
            fontSize: '12.5px', padding: '12px 15px', lineHeight: 1.55,
          }}>
            {error}
          </div>
        )}

        {data && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1px', background: B.border, border: `1px solid ${B.border}`,
            }}>
              {stats.map(([k, v]) => (
                <div key={k} style={{ background: B.panel, padding: '11px 14px' }}>
                  <div style={{ color: B.dim, fontSize: '9px', letterSpacing: '2px', marginBottom: '5px' }}>{k}</div>
                  <div style={{ color: k === 'MARKET CAP' ? '#ffb454' : B.text, fontSize: '13px' }}>{v}</div>
                </div>
              ))}
            </div>

            {data.position && (
              <div style={{ border: '1px solid #2a2a00', background: '#0e0e04', padding: '12px 16px' }}>
                <Label>YOUR POSITION</Label>
                <div style={{ color: '#ddd', fontSize: '13px' }}>
                  {data.position.quantity} shares @ ${data.position.avg_open_price.toFixed(2)} avg
                </div>
              </div>
            )}

            {(a?.summary || a?.description) && (
              <Panel>
                <Label>WHAT IT DOES</Label>
                <p style={{
                  color: '#e8e2d8', fontFamily: 'Georgia, serif', fontSize: '14.5px',
                  lineHeight: 1.75, margin: 0, maxWidth: '72ch',
                }}>
                  {a?.summary || a?.description}
                </p>
              </Panel>
            )}

            {(bullets(a?.bull_case).length > 0 || bullets(a?.bear_case).length > 0) && (
              <div className="r-grid-2">
                {bullets(a?.bull_case).length > 0 && (
                  <Panel>
                    <Label>CASE FOR</Label>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: '#7fbf9a', fontSize: '12.5px', lineHeight: 1.65 }}>
                      {bullets(a?.bull_case).map((b, i) => <li key={i} style={{ marginBottom: '7px' }}>{b}</li>)}
                    </ul>
                  </Panel>
                )}
                {bullets(a?.bear_case).length > 0 && (
                  <Panel>
                    <Label>CASE AGAINST</Label>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: '#d98b6f', fontSize: '12.5px', lineHeight: 1.65 }}>
                      {bullets(a?.bear_case).map((b, i) => <li key={i} style={{ marginBottom: '7px' }}>{b}</li>)}
                    </ul>
                  </Panel>
                )}
              </div>
            )}

            {a?.error && !a?.summary && (
              <Panel>
                <div style={{ color: '#8a8070', fontSize: '12.5px', lineHeight: 1.6 }}>
                  No company profile available for {ticker} — the provider lookup did not return.
                  The holdings below are unaffected.
                </div>
              </Panel>
            )}

            <div style={{ background: B.panel, border: `1px solid ${B.border}` }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${B.border}` }}>
                <div style={{ color: B.dim, fontSize: '9.5px', letterSpacing: '2px' }}>
                  HELD BY {heldBy}{trackedTotal ? ` OF ${trackedTotal}` : ''} TRACKED FUNDS
                  {data.holders?.aggregate_equity_weight ? ` · ${data.holders.aggregate_equity_weight.toFixed(1)}% AGGREGATE EQUITY WEIGHT` : ''}
                </div>
              </div>

              {holders.length === 0 ? (
                <div style={{ padding: '18px', color: '#8a8070', fontSize: '12.5px' }}>
                  No tracked fund reports this ticker.
                </div>
              ) : (
                <div className="r-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '620px' }}>
                    <thead>
                      <tr style={{ color: B.dim, fontSize: '9px', letterSpacing: '2px', textAlign: 'left' }}>
                        <th style={{ padding: '9px 18px', fontWeight: 'normal' }}>FUND</th>
                        <th style={{ padding: '9px 12px', fontWeight: 'normal' }}>TYPE</th>
                        <th style={{ padding: '9px 12px', fontWeight: 'normal', textAlign: 'right' }}>WEIGHT</th>
                        <th style={{ padding: '9px 12px', fontWeight: 'normal', textAlign: 'right' }}>VALUE</th>
                        <th style={{ padding: '9px 12px', fontWeight: 'normal', textAlign: 'right' }}>QUARTER</th>
                        <th style={{ padding: '9px 18px', fontWeight: 'normal', textAlign: 'right' }}>FIRST REPORTED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holders.map((h, i) => (
                        <tr key={`${h.fund}-${i}`} style={{ borderTop: '1px solid #161616' }}>
                          <td style={{ padding: '10px 18px', color: '#ddd' }}>{h.fund}</td>
                          <td style={{ padding: '10px 12px', color: '#666', fontSize: '10.5px' }}>
                            {h.entity_type?.replace(/_/g, ' ') ?? '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: B.amber, textAlign: 'right' }}>{h.weight.toFixed(2)}%</td>
                          <td style={{ padding: '10px 12px', color: '#bbb', textAlign: 'right' }}>{money(h.value)}</td>
                          <td style={{ padding: '10px 12px', color: '#777', textAlign: 'right' }}>{h.quarter}</td>
                          <td style={{ padding: '10px 18px', color: '#777', textAlign: 'right' }}>{h.first_reported}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ color: '#333', fontSize: '9px', letterSpacing: '1.5px', marginTop: '6px' }}>
              13F DATA REFLECTS A PRIOR QUARTER (45-DAY LAG) · NOT FINANCIAL ADVICE
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
