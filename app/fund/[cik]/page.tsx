'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navigation from '@/app/components/Navigation';
import type { FundProfile, ProfilePosition } from '@/lib/services/fund-profile';

const B = {
  bg: 'var(--bg-000000)', panel: 'var(--bg-0d0d0d)', border: 'var(--bg-2a2a2a)',
  amber: 'var(--bg-ff8c00)', label: 'var(--fg-888888)', dim: 'var(--fg-666666)', text: 'var(--fg-e0e0e0)',
};

const PAGE = 100;

function money(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function shares(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return Math.round(n).toLocaleString();
}

const INSTRUMENT_LABEL: Record<string, string> = {
  equity: 'Stock', debt: 'Bonds / notes', warrant: 'Warrants & rights', unknown: 'Unclassified',
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: B.dim, fontSize: '9.5px', letterSpacing: '2px', marginBottom: '10px' }}>{children}</div>
);

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: B.panel, border: `1px solid ${B.border}`, padding: '16px 18px' }}>{children}</div>
);

/**
 * Single-series bar list: label, bar, value. Bars share one scale (the largest
 * row), so lengths compare across rows; the value is always printed, so nothing
 * depends on reading the bar alone.
 */
function BarList({ rows }: { rows: { label: string; weight: number; count: number }[] }) {
  const max = Math.max(...rows.map(r => r.weight), 0.01);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {rows.map(r => (
        <div key={r.label} title={`${r.label}: ${r.weight.toFixed(2)}% across ${r.count} position${r.count === 1 ? '' : 's'}`}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 11rem) 1fr 3.6rem', alignItems: 'center', gap: '10px', fontSize: '11.5px' }}>
          <span style={{ color: 'var(--fg-bbbbbb)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div style={{ height: '8px', background: 'var(--bg-161616)' }}>
            <div style={{ width: `${(r.weight / max) * 100}%`, height: '100%', background: B.amber, borderRadius: '0 4px 4px 0', minWidth: '2px' }} />
          </div>
          <span style={{ color: B.text, textAlign: 'right' }}>{r.weight.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function Change({ c }: { c: ProfilePosition['change'] }) {
  if (c === null) return <span style={{ color: 'var(--fg-444444)' }}>—</span>;
  if (c === 'NEW') return <span style={{ color: 'var(--fg-7fbf9a)', fontSize: '10px', letterSpacing: '1px' }}>NEW</span>;
  if (Math.abs(c) < 0.005) return <span style={{ color: 'var(--fg-555555)' }}>0.00</span>;
  return <span style={{ color: c > 0 ? 'var(--fg-7fbf9a)' : 'var(--fg-d98b6f)' }}>{c > 0 ? '+' : ''}{c.toFixed(2)}</span>;
}

function PositionName({ p }: { p: ProfilePosition }) {
  if (p.resolved) {
    return (
      <Link href={`/company/${p.ticker}`} style={{ color: B.amber, textDecoration: 'none', fontWeight: 'bold', letterSpacing: '1px' }}>
        {p.ticker}
      </Link>
    );
  }
  // Unresolved: the CUSIP is the real identity, the issuer name is the readable one.
  return <span style={{ color: 'var(--fg-999999)', fontSize: '10.5px' }} title={p.cusip ?? undefined}>{p.cusip ?? p.ticker}</span>;
}

export default function FundPage() {
  const params = useParams();
  const cik = String(params?.cik ?? '');

  const [data, setData] = useState<FundProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (!cik) return;
    let cancelled = false;
    setLoading(true); setError(null); setNeedsAuth(false); setElapsed(0);
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    fetch(`/api/fund/${encodeURIComponent(cik)}`)
      .then(async r => {
        if (r.status === 401 || r.redirected) {
          if (!cancelled) setNeedsAuth(true);
          return null;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
        return j as FundProfile;
      })
      .then(j => { if (j && !cancelled) setData(j); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { clearInterval(tick); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; clearInterval(tick); };
  }, [cik]);

  const visible = useMemo(() => {
    const all = data?.positions ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(p =>
      p.ticker.toLowerCase().includes(q) ||
      (p.issuer ?? '').toLowerCase().includes(q) ||
      (p.sector ?? '').toLowerCase().includes(q));
  }, [data, filter]);


  // Rank in the full book, kept while filtering — "#412" says how small it is.
  const rankOf = useMemo(() => new Map((data?.positions ?? []).map((p, i) => [p, i + 1])), [data]);

  const f = data?.fund;
  const s = data?.stats;

  const stats: [string, string][] = [];
  if (data?.quarter && s) {
    stats.push(['REPORTED VALUE', money(s.total_value)]);
    stats.push(['POSITIONS', s.positions.toLocaleString()]);
    stats.push(['AS OF', `${data.quarter}${data.period_end ? ` · ${data.period_end}` : ''}`]);
    if (data.filing_date) stats.push(['FILED', data.filing_date]);
    stats.push(['TOP 10', `${s.top10_weight.toFixed(1)}%`]);
    stats.push(['TOP 25', `${s.top25_weight.toFixed(1)}%`]);
  }

  // Sector chart: the ten largest plus a folded remainder, so the list stays
  // readable and the bars still add up to what the coverage line says.
  const sectorRows = useMemo(() => {
    const rows = data?.composition.by_sector ?? [];
    const top = rows.slice(0, 10).map(r => ({ label: r.sector, weight: r.weight, count: r.count }));
    const rest = rows.slice(10);
    if (rest.length) {
      top.push({ label: `Other (${rest.length} sectors)`, weight: rest.reduce((a, r) => a + r.weight, 0), count: rest.reduce((a, r) => a + r.count, 0) });
    }
    return top;
  }, [data]);

  const newPositions = (data?.positions ?? []).filter(p => p.change === 'NEW').slice(0, 8);
  const movers = (data?.positions ?? [])
    .filter((p): p is ProfilePosition & { change: number } => typeof p.change === 'number')
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8);

  const edgarUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F-HR&dateb=&owner=include&count=40`;

  return (
    <div style={{ minHeight: '100vh', background: B.bg, color: B.text, fontFamily: 'Courier New, monospace' }}>
      <Navigation />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '22px 16px 60px' }}>

        <div style={{ color: 'var(--fg-444444)', fontSize: '10px', letterSpacing: '2px', marginBottom: '10px' }}>
          <Link href="/fund" style={{ color: B.dim, textDecoration: 'none' }}>← ALL FUNDS</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h1 style={{ color: B.amber, fontSize: '26px', fontWeight: 900, letterSpacing: '2px', margin: 0 }}>
            {f?.name ?? (loading ? '…' : `CIK ${cik}`)}
          </h1>
          {f && <span style={{ color: 'var(--fg-bbbbbb)', fontSize: '12px', letterSpacing: '1px' }}>{f.entity_label.toUpperCase()}</span>}
        </div>
        <div style={{ color: 'var(--fg-444444)', fontSize: '10px', letterSpacing: '2px', marginBottom: f?.aliases.length ? '6px' : '18px' }}>
          CIK {cik} · 13F PORTFOLIO
          {' · '}
          <a href={edgarUrl} target="_blank" rel="noopener noreferrer" style={{ color: B.amber, textDecoration: 'none' }}>SEC FILINGS →</a>
        </div>
        {f && f.aliases.length > 0 && (
          <div style={{ color: B.dim, fontSize: '11px', marginBottom: '18px' }}>
            Also known as {f.aliases.join(' · ')}
            {f.tags.length > 0 && <span style={{ color: 'var(--fg-555555)' }}> — {f.tags.join(', ')}</span>}
          </div>
        )}

        {loading && (
          <div style={{ padding: '50px 0', fontSize: '12px', lineHeight: 1.8 }}>
            <div style={{ color: B.amber, letterSpacing: '2px' }}>LOADING… {elapsed > 2 ? `${elapsed}s` : ''}</div>
            {elapsed > 3 && (
              <div style={{ color: B.dim, maxWidth: '60ch', marginTop: '6px' }}>
                First time anyone has opened this fund — pulling its latest 13F from SEC EDGAR and
                matching each security to a ticker. Large filers report thousands of positions and
                can take a minute or two. Once loaded it’s stored, and opens instantly after that.
              </div>
            )}
          </div>
        )}

        {needsAuth && (
          <Panel>
            <Label>SIGN IN TO VIEW</Label>
            <p style={{ color: 'var(--fg-bbbbbb)', fontSize: '13px', lineHeight: 1.7, margin: '0 0 16px', maxWidth: '58ch' }}>
              Fund pages need an account. Sign in and this page will load.
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
            border: '1px solid var(--bg-3a1010)', background: 'var(--bg-140606)', color: 'var(--fg-e07a5a)',
            fontSize: '12.5px', padding: '12px 15px', lineHeight: 1.55,
          }}>
            {error}
          </div>
        )}

        {data && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {data.stale_warning && (
              <div style={{ border: '1px solid var(--bg-2a2a00)', background: 'var(--bg-0e0e04)', color: 'var(--fg-d9c36f)', fontSize: '12px', padding: '10px 14px', lineHeight: 1.55 }}>
                {data.stale_warning}
              </div>
            )}

            {f?.note && (
              <div style={{ border: `1px solid ${B.border}`, borderLeft: `3px solid ${B.amber}`, background: B.panel, color: 'var(--fg-bbbbbb)', fontSize: '12.5px', padding: '11px 14px', lineHeight: 1.6 }}>
                {f.note}
              </div>
            )}

            {!data.quarter ? (
              <Panel>
                <div style={{ color: 'var(--fg-8a8070)', fontSize: '12.5px', lineHeight: 1.6 }}>
                  No 13F holdings on record for this filer.
                </div>
              </Panel>
            ) : (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))',
                  gap: '1px', background: B.border, border: `1px solid ${B.border}`,
                }}>
                  {stats.map(([k, v]) => (
                    <div key={k} style={{ background: B.panel, padding: '11px 14px' }}>
                      <div style={{ color: B.dim, fontSize: '9px', letterSpacing: '2px', marginBottom: '5px' }}>{k}</div>
                      <div style={{ color: k === 'REPORTED VALUE' ? 'var(--bg-ffb454)' : B.text, fontSize: '13px' }}>{v}</div>
                    </div>
                  ))}
                </div>

                {data.thesis && (
                  <Panel>
                    <Label>WHAT IT BETS ON</Label>
                    <p style={{ color: 'var(--fg-e8e2d8)', fontFamily: 'Georgia, serif', fontSize: '14.5px', lineHeight: 1.75, margin: 0, maxWidth: '72ch' }}>
                      {data.thesis}
                    </p>
                  </Panel>
                )}

                <div className="r-grid-2">
                  <Panel>
                    <Label>PORTFOLIO BY SECTOR</Label>
                    {sectorRows.length ? (
                      <>
                        <BarList rows={sectorRows} />
                        <div style={{ color: 'var(--fg-555555)', fontSize: '10px', marginTop: '12px', lineHeight: 1.5 }}>
                          % of reported value. Sector known for {data.composition.sector_coverage.toFixed(0)}% of the book
                          {data.composition.sector_coverage < 95 ? ' — the rest is unclassified (ETFs, bonds, or names not yet enriched).' : '.'}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--fg-8a8070)', fontSize: '12px', lineHeight: 1.6 }}>
                        No sector data for these holdings yet — it fills in when fundamentals are enriched
                        (scripts/enrich-fundamentals.js).
                      </div>
                    )}
                  </Panel>
                  <Panel>
                    <Label>BY INSTRUMENT</Label>
                    <BarList rows={data.composition.by_instrument.map(r => ({ label: INSTRUMENT_LABEL[r.type] ?? r.type, weight: r.weight, count: r.count }))} />
                    <div style={{ color: 'var(--fg-555555)', fontSize: '10px', marginTop: '12px', lineHeight: 1.5 }}>
                      13Fs show long positions only — shorts, cash and most derivatives are not disclosed.
                      {s && s.unresolved > 0 && ` ${s.unresolved.toLocaleString()} position${s.unresolved === 1 ? '' : 's'} shown by CUSIP and issuer name (no ticker match).`}
                    </div>
                  </Panel>
                </div>

                {data.has_prior_quarter && (newPositions.length > 0 || movers.length > 0 || data.exited.length > 0) && (
                  <div className="r-grid-2">
                    <Panel>
                      <Label>NEW THIS QUARTER</Label>
                      {newPositions.length === 0 ? (
                        <div style={{ color: 'var(--fg-8a8070)', fontSize: '12px' }}>No new positions.</div>
                      ) : newPositions.map(p => (
                        <div key={p.cusip ?? p.ticker} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', padding: '4px 0' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <PositionName p={p} /> <span style={{ color: B.dim, fontSize: '11px' }}>{p.issuer}</span>
                          </span>
                          <span style={{ color: B.text }}>{p.weight.toFixed(2)}%</span>
                        </div>
                      ))}
                      {data.exited.length > 0 && (
                        <>
                          <div style={{ color: B.dim, fontSize: '9.5px', letterSpacing: '2px', margin: '14px 0 6px' }}>EXITED</div>
                          <div style={{ color: 'var(--fg-999999)', fontSize: '11.5px', lineHeight: 1.7 }}>
                            {data.exited.map(x => /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(x.ticker) ? x.ticker : (x.issuer ?? x.ticker)).join(' · ')}
                          </div>
                        </>
                      )}
                    </Panel>
                    <Panel>
                      <Label>BIGGEST WEIGHT CHANGES (PTS)</Label>
                      {movers.length === 0 ? (
                        <div style={{ color: 'var(--fg-8a8070)', fontSize: '12px' }}>No changes in continuing positions.</div>
                      ) : movers.map(p => (
                        <div key={p.cusip ?? p.ticker} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', padding: '4px 0' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <PositionName p={p} /> <span style={{ color: B.dim, fontSize: '11px' }}>{p.issuer}</span>
                          </span>
                          <span><Change c={p.change} /> <span style={{ color: B.dim, fontSize: '11px' }}>→ {p.weight.toFixed(2)}%</span></span>
                        </div>
                      ))}
                    </Panel>
                  </div>
                )}

                <div style={{ background: B.panel, border: `1px solid ${B.border}` }}>
                  <div style={{ padding: '11px 18px', borderBottom: `1px solid ${B.border}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ color: B.dim, fontSize: '9.5px', letterSpacing: '2px', flex: 1, minWidth: '12rem' }}>
                      HOLDINGS · {visible.length.toLocaleString()}{filter ? ` OF ${data.positions.length.toLocaleString()}` : ''} POSITIONS
                      {data.has_prior_quarter ? ' · Δ = WEIGHT CHANGE VS PRIOR QUARTER' : ''}
                    </div>
                    <input
                      value={filter}
                      onChange={e => { setFilter(e.target.value); setShown(PAGE); }}
                      placeholder="Filter ticker, name, sector"
                      style={{
                        background: 'var(--bg-0a0a0a)', border: `1px solid ${B.border}`, color: B.text,
                        fontFamily: 'Courier New, monospace', fontSize: '12px', padding: '6px 10px', outline: 'none',
                        width: '100%', maxWidth: '16rem',
                      }}
                    />
                  </div>

                  <div className="r-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '760px' }}>
                      <thead>
                        <tr style={{ color: B.dim, fontSize: '9px', letterSpacing: '2px', textAlign: 'left' }}>
                          <th style={{ padding: '9px 6px 9px 18px', fontWeight: 'normal', textAlign: 'right' }}>#</th>
                          <th style={{ padding: '9px 12px', fontWeight: 'normal' }}>TICKER</th>
                          <th style={{ padding: '9px 12px', fontWeight: 'normal' }}>ISSUER</th>
                          <th style={{ padding: '9px 12px', fontWeight: 'normal' }}>SECTOR</th>
                          <th style={{ padding: '9px 12px', fontWeight: 'normal', width: '150px' }}>WEIGHT</th>
                          <th style={{ padding: '9px 12px', fontWeight: 'normal', textAlign: 'right' }}>VALUE</th>
                          <th style={{ padding: '9px 12px', fontWeight: 'normal', textAlign: 'right' }}>SHARES</th>
                          <th style={{ padding: '9px 18px 9px 12px', fontWeight: 'normal', textAlign: 'right' }}>Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.slice(0, shown).map(p => {
                          const rank = rankOf.get(p);
                          const maxW = data.positions[0]?.weight || 1;
                          return (
                            <tr key={p.cusip ?? p.ticker} style={{ borderTop: '1px solid var(--bg-161616)' }}>
                              <td style={{ padding: '8px 6px 8px 18px', color: 'var(--fg-555555)', textAlign: 'right' }}>{rank}</td>
                              <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                <PositionName p={p} />
                                {p.instrument !== 'equity' && p.instrument !== 'unknown' && (
                                  <span style={{ color: 'var(--fg-777777)', fontSize: '9px', letterSpacing: '1px', marginLeft: '6px' }}>
                                    {p.instrument.toUpperCase()}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--fg-cccccc)', maxWidth: '16rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.issuer ?? '—'}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--fg-777777)', fontSize: '11px', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sector ?? '—'}</td>
                              <td style={{ padding: '8px 12px' }} title={`${p.weight.toFixed(3)}% of reported value`}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ flex: 1, height: '6px', background: 'var(--bg-161616)' }}>
                                    <div style={{ width: `${(p.weight / maxW) * 100}%`, height: '100%', background: B.amber, borderRadius: '0 3px 3px 0', minWidth: '1px' }} />
                                  </div>
                                  <span style={{ color: B.text, width: '3.4rem', textAlign: 'right' }}>{p.weight.toFixed(2)}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--fg-bbbbbb)', textAlign: 'right' }}>{money(p.value)}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--fg-888888)', textAlign: 'right' }}>{shares(p.shares)}</td>
                              <td style={{ padding: '8px 18px 8px 12px', textAlign: 'right' }}><Change c={p.change} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {visible.length > shown && (
                    <div style={{ padding: '12px 18px', borderTop: `1px solid ${B.border}`, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button onClick={() => setShown(n => n + PAGE)} style={btn}>SHOW {Math.min(PAGE, visible.length - shown)} MORE</button>
                      <button onClick={() => setShown(visible.length)} style={btn}>SHOW ALL {visible.length.toLocaleString()}</button>
                    </div>
                  )}
                </div>

                <div style={{ color: 'var(--fg-333333)', fontSize: '9px', letterSpacing: '1.5px', marginTop: '6px' }}>
                  {data.source === 'edgar' ? 'JUST LOADED FROM SEC EDGAR' : 'SERVED FROM CACHE · REFRESHES WHEN A NEWER 13F IS FILED'}
                  {' · '}13F DATA REFLECTS A PRIOR QUARTER (45-DAY LAG) · NOT FINANCIAL ADVICE
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--bg-2a2a2a)', color: 'var(--bg-ff8c00)',
  fontFamily: 'Courier New, monospace', fontSize: '10px', letterSpacing: '1.5px', padding: '7px 14px', cursor: 'pointer',
};
