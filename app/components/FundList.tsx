'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TradeModal from './TradeModal';
import BasketModal from './BasketModal';
import TickerTooltip from './TickerTooltip';
import useAccountSource from './useAccountSource';
import useFundSearch from './useFundSearch';

interface Holding {
  ticker: string;
  shares: number;
  value: number;
  weight: number;
  issuer_name?: string | null;
  put_call?: 'put' | 'call' | null;
}

// Options can't go into a basket: buying the stock to copy a PUT is the opposite
// trade, and a call's 13F value is the shares it controls, not a stock position.
const buyable = (h: Holding) => !h.put_call;

interface Fund {
  id: string;
  cik: string;
  name: string;
  quarter: string | null;
  holdings_total: number;
  holdings: Holding[];
  thesis: string | null;
}

interface EdgarHit { cik: string; name: string; last13F: string }

const TYPE_LABEL: Record<string, string> = {
  hedge_fund: 'HEDGE FUND', asset_manager: 'ASSET MANAGER', endowment: 'ENDOWMENT',
  sovereign_wealth: 'SOVEREIGN WEALTH', corporate: 'CORPORATE',
};

const EXAMPLES = ['Ray Dalio', 'Buffett', 'quant funds', 'activist', 'tiger cubs'];

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let toastId = 0;

const B = {
  bg: 'var(--bg-000000)', panel: 'var(--bg-0d0d0d)', border: 'var(--bg-2a2a2a)',
  amber: 'var(--bg-ff8c00)', amberDim: 'var(--bg-cc6d00)',
  green: 'var(--bg-00ff41)', red: 'var(--bg-ff3333)', cyan: 'var(--bg-00e5ff)',
  label: 'var(--fg-888888)', text: 'var(--fg-e0e0e0)',
};

const panelStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.border}` };
const btnAmber: React.CSSProperties = { padding: '4px 12px', background: B.amber, color: 'var(--fg-000000)', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' };
const btnGhost: React.CSSProperties = { padding: '4px 12px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' };
const btnRed: React.CSSProperties = { padding: '4px 12px', background: 'transparent', color: B.red, border: `1px solid var(--bg-4a0000)`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' };
const thStyle: React.CSSProperties = { color: B.label, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', padding: '5px 10px', textAlign: 'left', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal' };
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid var(--bg-111111)', fontSize: '12px', color: B.text };

export default function FundList() {
  const router = useRouter();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  // Asked of the server, not inferred from whether a paper account exists —
  // see useAccountSource for why that inference was always true.
  const { isPaper } = useAccountSource();
  const [syncing, setSyncing] = useState(false);
  const [syncingCik, setSyncingCik] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<{ symbol: string; price: number } | null>(null);
  const [basketFund, setBasketFund] = useState<{ fund: Fund; selected: Holding[] } | null>(null);
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  function toggleCollapsed(fundId: string) {
    setCollapsedMap(prev => ({ ...prev, [fundId]: !prev[fundId] }));
  }

  const [query, setQuery] = useState('');
  const [edgarHits, setEdgarHits] = useState<EdgarHit[] | null>(null);
  const [edgarLoading, setEdgarLoading] = useState(false);
  const [followingCik, setFollowingCik] = useState<string | null>(null);
  const edgarSeq = useRef(0);

  useEffect(() => {
    fetchFunds();
  }, []);

  // Directory matches are local and instant: names, managers, nicknames, strategies.
  // …and matches by what funds hold arrive from the embedding index once typing pauses.
  const { instant: directoryHits, semantic: portfolioHits, loading: semanticLoading } = useFundSearch(query);
  const followed = useMemo(() => new Set(funds.map(f => f.cik)), [funds]);
  const cikQuery = /^\d{1,10}$/.test(query.trim()) ? query.trim().padStart(10, '0') : null;

  // EDGAR covers every other 13F filer. Searched automatically when the
  // directory comes up short, debounced so typing doesn't fan out requests.
  useEffect(() => {
    setEdgarHits(null);
    const q = query.trim();
    if (q.length < 3 || cikQuery || directoryHits.length >= 3) return;
    const seq = ++edgarSeq.current;
    const t = setTimeout(async () => {
      setEdgarLoading(true);
      try {
        const res = await fetch(`/api/sec/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (seq === edgarSeq.current) setEdgarHits(data.success ? data.data : []);
      } catch {
        if (seq === edgarSeq.current) setEdgarHits([]);
      } finally {
        if (seq === edgarSeq.current) setEdgarLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, cikQuery, directoryHits.length]);

  function toast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  async function fetchFunds(quiet = false): Promise<Fund[]> {
    try {
      if (!quiet) setLoading(true);
      const res = await fetch('/api/funds');
      const data = await res.json();
      if (data.success) { setFunds(data.data); return data.data; }
    } catch { toast('FAILED TO LOAD FUNDS', 'error'); } finally { setLoading(false); }
    return [];
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const res = await fetch('/api/funds', { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        const results: Array<{ name: string; success: boolean; holdingsCount: number; error?: string }> = data.data;
        const failed = results.filter(r => !r.success);
        if (failed.length === 0) toast(`SYNCED ${results.length} FUND${results.length !== 1 ? 'S' : ''}`);
        else toast(`${results.length - failed.length} OK, ${failed.length} FAILED`, 'error');
        await fetchFunds(true);
      } else toast(data.error || 'SYNC FAILED', 'error');
    } catch { toast('SYNC FAILED', 'error'); } finally { setSyncing(false); }
  }

  async function syncOne(cik: string, name: string) {
    setSyncingCik(cik);
    try {
      const res = await fetch(`/api/funds/${cik}`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) { toast(`${name} — ${data.data.holdingsCount} HOLDINGS (${data.data.quarter})`); await fetchFunds(true); }
      else toast(data.error || `SYNC FAILED: ${name}`, 'error');
    } catch { toast(`SYNC FAILED: ${name}`, 'error'); } finally { setSyncingCik(null); }
  }

  async function unfollow(cik: string, name: string) {
    if (!confirm(`STOP FOLLOWING ${name.toUpperCase()}?`)) return;
    try {
      const res = await fetch(`/api/funds/${cik}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast(`UNFOLLOWED ${name.toUpperCase()}`); setFunds(prev => prev.filter(f => f.cik !== cik)); }
      else toast(data.error || 'UNFOLLOW FAILED', 'error');
    } catch { toast('UNFOLLOW FAILED', 'error'); }
  }

  async function follow(cik: string, name: string) {
    setFollowingCik(cik);
    try {
      const res = await fetch('/api/funds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cik }) });
      const data = await res.json();
      if (!data.success) { toast(data.error || 'FOLLOW FAILED', 'error'); return; }
      const shown = data.data?.name ?? name;
      toast(`FOLLOWING ${shown.toUpperCase()}`);
      // A fund nobody has opened has no holdings yet — load it now rather than
      // leaving an empty card. Large filers take a minute; the card says so.
      const fresh = (await fetchFunds(true)).find(f => f.cik === data.data.cik);
      if (fresh && !fresh.quarter) syncOne(fresh.cik, shown);
    } catch { toast('FOLLOW FAILED', 'error'); } finally { setFollowingCik(null); }
  }

  function getSelected(fundId: string, holdings: Holding[]): Set<string> {
    return selectedMap[fundId] ?? new Set(holdings.filter(buyable).map(h => h.ticker));
  }

  function toggleTicker(fundId: string, ticker: string, holdings: Holding[]) {
    const current = new Set(getSelected(fundId, holdings));
    if (current.has(ticker)) current.delete(ticker); else current.add(ticker);
    setSelectedMap(prev => ({ ...prev, [fundId]: current }));
  }

  function toggleAll(fundId: string, holdings: Holding[]) {
    const current = getSelected(fundId, holdings);
    const all = holdings.filter(buyable);
    const next = current.size === all.length ? new Set<string>() : new Set(all.map(h => h.ticker));
    setSelectedMap(prev => ({ ...prev, [fundId]: next }));
  }

  const inputStyle: React.CSSProperties = { background: 'var(--bg-000000)', border: `1px solid ${B.border}`, color: B.amber, padding: '6px 10px', fontFamily: 'Courier New, monospace', fontSize: '12px', outline: 'none', flex: 1 };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px', color: B.amber }}>
        <span style={{ letterSpacing: '2px', fontSize: '12px' }}>LOADING FUNDS...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Toasts */}
      <div className="toast-stack" style={{ position: 'fixed', top: '52px', right: '12px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ padding: '8px 14px', background: t.type === 'success' ? 'var(--bg-001a00)' : 'var(--bg-1a0000)', border: `1px solid ${t.type === 'success' ? B.green : B.red}`, color: t.type === 'success' ? B.green : B.red, fontSize: '11px', letterSpacing: '1px', maxWidth: '280px' }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ color: B.amber, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>FOLLOWED FUNDS</div>
          {isPaper && (
            <div style={{ background: 'var(--bg-002200)', border: '1px solid var(--bg-00ff41)', color: 'var(--fg-00ff41)', fontSize: '9px', fontWeight: 'bold', letterSpacing: '2px', padding: '2px 8px' }}>
              PAPER TRADING
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowAddForm(v => !v)} style={btnAmber}>+ ADD FUND</button>
          {!isPaper && (
            <button onClick={syncAll} disabled={syncing || funds.length === 0}
              style={{ ...btnGhost, color: syncing ? B.label : B.cyan, borderColor: syncing ? B.border : 'var(--bg-004a5a)', opacity: (syncing || funds.length === 0) ? 0.5 : 1 }}>
              {syncing ? 'SYNCING...' : 'SYNC ALL'}
            </button>
          )}
        </div>
      </div>

      {/* Add Fund Form */}
      {showAddForm && (
        <div style={{ ...panelStyle, padding: '16px', borderColor: B.amberDim, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ color: B.amber, fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px' }}>FIND A FUND</div>
            <button onClick={() => { setShowAddForm(false); setQuery(''); }} style={btnGhost}>CLOSE</button>
          </div>
          <input
            type="text" autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Fund, manager or strategy — e.g. “Ray Dalio’s fund”, “quant funds” — or a CIK"
            style={{ ...inputStyle, padding: '9px 12px', fontSize: '13px' }}
          />
          {!query.trim() && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => setQuery(ex)} style={{ ...btnGhost, fontSize: '10px', padding: '3px 9px' }}>{ex}</button>
              ))}
            </div>
          )}

          {cikQuery && (
            <SearchRow
              name={`CIK ${cikQuery}`} detail="Follow any 13F filer by its SEC number"
              cik={cikQuery} followed={followed.has(cikQuery)} busy={followingCik === cikQuery}
              onFollow={() => follow(cikQuery, `CIK ${cikQuery}`)}
            />
          )}

          {directoryHits.length > 0 && (
            <div style={{ border: `1px solid ${B.border}` }}>
              {directoryHits.map(f => (
                <SearchRow
                  key={f.cik} name={f.name} badge={TYPE_LABEL[f.entity_type]}
                  detail={[f.aliases.filter(a => a.toLowerCase() !== f.name.toLowerCase()).slice(0, 3).join(' · '), f.tags.join(', ')].filter(Boolean).join(' — ')}
                  cik={f.cik} followed={followed.has(f.cik)} busy={followingCik === f.cik}
                  onFollow={() => follow(f.cik, f.name)}
                />
              ))}
            </div>
          )}

          {(semanticLoading || portfolioHits.length > 0) && (
            <div>
              <div style={{ color: B.label, fontSize: '9.5px', letterSpacing: '2px', margin: '4px 0 6px' }}>
                {semanticLoading && !portfolioHits.length ? 'MATCHING AGAINST WHAT FUNDS HOLD…' : 'MATCHED BY WHAT THEY HOLD'}
              </div>
              {portfolioHits.length > 0 && (
                <div style={{ border: `1px solid ${B.border}` }}>
                  {portfolioHits.map(f => (
                    <SearchRow
                      key={f.cik} name={f.name} badge={TYPE_LABEL[f.entity_type]}
                      detail={f.why ? `Largest: ${f.why}` : `Profile match — holdings not loaded yet${f.tags.length ? ` · ${f.tags.join(', ')}` : ''}`}
                      cik={f.cik} followed={followed.has(f.cik)} busy={followingCik === f.cik}
                      onFollow={() => follow(f.cik, f.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* "None on EDGAR" only matters when nothing tracked matched either —
              a theme query never names an EDGAR filer. */}
          {(!!edgarHits?.length || (edgarHits && !semanticLoading && !portfolioHits.length && !directoryHits.length)) && (
            <div>
              <div style={{ color: B.label, fontSize: '9.5px', letterSpacing: '2px', margin: '4px 0 6px' }}>
                {edgarLoading ? 'SEARCHING SEC EDGAR…' : `OTHER 13F FILERS ON SEC EDGAR${edgarHits?.length ? '' : ' — NONE MATCH'}`}
              </div>
              {!!edgarHits?.length && (
                <div style={{ border: `1px solid ${B.border}` }}>
                  {edgarHits.map(h => (
                    <SearchRow
                      key={h.cik} name={h.name} detail={`CIK ${h.cik} · last 13F filed ${h.last13F}`}
                      cik={h.cik} followed={followed.has(h.cik)} busy={followingCik === h.cik}
                      onFollow={() => follow(h.cik, h.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {query.trim() && !cikQuery && directoryHits.length === 0 && query.trim().length < 3 && (
            <div style={{ color: B.label, fontSize: '11px' }}>Keep typing…</div>
          )}
        </div>
      )}

      {/* Fund list */}
      {funds.length === 0 ? (
        <div style={{ ...panelStyle, padding: '48px', textAlign: 'center' }}>
          <p style={{ color: B.label, fontSize: '12px', letterSpacing: '1px' }}>NOT FOLLOWING ANY FUNDS</p>
          <p style={{ color: 'var(--fg-444444)', fontSize: '11px', marginTop: '6px' }}>CLICK + ADD FUND AND SEARCH BY NAME, MANAGER OR STRATEGY</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {funds.map(fund => {
            const isSyncingThis = syncingCik === fund.cik;
            const isExpanded = !!collapsedMap[fund.id];
            return (
              <div key={fund.id} style={panelStyle}>
                {/* Fund header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', borderBottom: isExpanded ? `1px solid ${B.border}` : 'none' }}>
                  <button onClick={() => toggleCollapsed(fund.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0, textAlign: 'left', minWidth: 0, flex: '1 1 180px' }}>
                    <span style={{ color: B.amber, fontSize: '10px', userSelect: 'none' }}>{isExpanded ? '▼' : '▶'}</span>
                    <div>
                      <div style={{ color: B.amber, fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px', fontFamily: 'Courier New, monospace', overflowWrap: 'anywhere' }}>{fund.name.toUpperCase()}</div>
                      <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>
                        CIK: {fund.cik}
                        {fund.quarter ? ` · ${fund.quarter} · ${fund.holdings_total.toLocaleString()} POSITIONS` : isSyncingThis ? ' · LOADING FROM SEC — LARGE FILERS TAKE A MINUTE' : ' · NOT LOADED YET'}
                      </div>
                    </div>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link href={`/fund/${fund.cik}`} style={{ ...btnGhost, color: B.amber, textDecoration: 'none' }}>FULL PORTFOLIO →</Link>
                    {!isPaper && (
                      <button onClick={() => syncOne(fund.cik, fund.name)} disabled={isSyncingThis}
                        style={{ ...btnGhost, color: B.cyan, borderColor: 'var(--bg-004a5a)', opacity: isSyncingThis ? 0.5 : 1 }}>
                        {isSyncingThis ? 'SYNCING...' : 'SYNC'}
                      </button>
                    )}
                    <button onClick={() => unfollow(fund.cik, fund.name)} style={btnRed}>UNFOLLOW</button>
                  </div>
                </div>

                {/* Fund thesis — shown with the fund's holdings, not on hover:
                    a pointer crossing the row is not a request to read it, and
                    on a touch screen there is no hover to begin with. */}
                {fund.thesis && (() => {
                  const showThesis = isExpanded;
                  return (
                  <div style={{
                    overflow: 'hidden',
                    maxHeight: showThesis ? '300px' : '0px',
                    opacity: showThesis ? 1 : 0,
                    transition: 'max-height 0.35s ease, opacity 0.25s ease',
                    borderBottom: showThesis ? `1px solid ${B.border}` : 'none',
                    background: 'var(--bg-050505)',
                  }}>
                    <p style={{ color: 'var(--fg-aaaaaa)', fontSize: '14px', lineHeight: 1.9, margin: 0, padding: '14px 16px', letterSpacing: '0.3px' }}>{fund.thesis}</p>
                  </div>
                  );
                })()}

                {/* Holdings table */}
                {isExpanded && (() => {
                  const selected = getSelected(fund.id, fund.holdings);
                  if (fund.holdings.length === 0) {
                    return (
                      <div style={{ padding: '24px', textAlign: 'center', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>
                        NO HOLDINGS —{' '}
                        <button onClick={() => syncOne(fund.cik, fund.name)} style={{ background: 'none', border: 'none', color: B.cyan, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline' }}>
                          SYNC NOW
                        </button>
                      </div>
                    );
                  }
                  const buyableCount = fund.holdings.filter(buyable).length;
                  const allChecked = buyableCount > 0 && selected.size === buyableCount;
                  const someChecked = selected.size > 0 && !allChecked;
                  const selectedHoldings = fund.holdings.filter(h => buyable(h) && selected.has(h.ticker));
                  return (
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <span style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>
                          {fund.holdings.length} HOLDINGS — {selected.size} SELECTED
                        </span>
                        <button
                          onClick={() => setBasketFund({ fund, selected: selectedHoldings })}
                          disabled={selectedHoldings.length === 0}
                          style={{ ...btnAmber, background: selectedHoldings.length === 0 ? 'var(--bg-333333)' : B.green, color: 'var(--fg-000000)', opacity: selectedHoldings.length === 0 ? 0.4 : 1 }}
                        >
                          BUY BASKET{selected.size < buyableCount ? ` (${selected.size})` : ''}
                        </button>
                      </div>
                      <div className="r-scroll">
                        <table className="r-cards" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ ...thStyle, width: '32px' }}>
                                <input type="checkbox" checked={allChecked}
                                  ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = someChecked; }}
                                  onChange={() => toggleAll(fund.id, fund.holdings)}
                                  style={{ cursor: 'pointer', accentColor: B.amber }}
                                />
                              </th>
                              {['#', 'Ticker', 'Shares', 'Value', 'Weight', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {fund.holdings.slice(0, 15).map((h, idx) => {
                              const option = !buyable(h);
                              const checked = !option && selected.has(h.ticker);
                              return (
                                <tr key={idx} onClick={() => { if (!option) toggleTicker(fund.id, h.ticker, fund.holdings); }}
                                  style={{ cursor: option ? 'default' : 'pointer', opacity: checked || option ? 1 : 0.35 }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-1a1a00)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <td data-label="Include" style={{ ...tdStyle, width: '32px' }} onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={checked} disabled={option} title={option ? 'Options can’t be bought as part of a basket' : undefined} onChange={() => toggleTicker(fund.id, h.ticker, fund.holdings)} style={{ cursor: option ? 'not-allowed' : 'pointer', accentColor: B.amber }} />
                                  </td>
                                  <td data-label="" style={{ ...tdStyle, color: B.label, fontSize: '10px' }}>{idx + 1}</td>
                                  <td data-head="" data-label="Ticker" style={{ ...tdStyle, color: B.amber, fontWeight: 'bold', letterSpacing: '1px' }} onClick={e => e.stopPropagation()}>
                                    <TickerTooltip ticker={h.ticker}>
                                      <span
                                        onClick={() => router.push(`/stock/${h.ticker}`)}
                                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#ff8c0066' }}
                                      >
                                        {h.ticker}
                                      </span>
                                    </TickerTooltip>
                                    {h.put_call && (
                                      <span title={h.put_call === 'put' ? 'Put options — a bet that this stock falls' : 'Call options'}
                                        style={{ marginLeft: '6px', fontSize: '9px', padding: '0 4px', color: h.put_call === 'put' ? 'var(--fg-d98b6f)' : B.label, border: `1px solid ${h.put_call === 'put' ? 'var(--fg-d98b6f)' : B.border}` }}>
                                        {h.put_call === 'put' ? 'PUT' : 'CALL'}
                                      </span>
                                    )}
                                  </td>
                                  <td data-label="Shares" style={tdStyle}>{h.shares.toLocaleString()}</td>
                                  <td data-label="Value" style={{ ...tdStyle, color: B.cyan }}>
                                    ${(h.value / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M
                                  </td>
                                  <td data-label="Weight" style={tdStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ width: '60px', background: 'var(--bg-1a1a1a)', height: '3px', position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(h.weight, 100)}%`, background: B.amber }} />
                                      </div>
                                      <span style={{ color: B.label, fontSize: '11px' }}>{h.weight.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                  <td data-label="Trade" style={tdStyle} onClick={e => e.stopPropagation()}>
                                    {!option && <button onClick={() => setTradeTarget({ symbol: h.ticker, price: 0 })}
                                      style={{ padding: '2px 8px', background: B.green, color: 'var(--fg-000000)', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px' }}>
                                      BUY
                                    </button>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {fund.holdings_total > 15 && (
                        <p style={{ color: B.label, fontSize: '10px', letterSpacing: '1px', textAlign: 'right', marginTop: '6px' }}>
                          SHOWING 15 OF {fund.holdings_total.toLocaleString()} HOLDINGS ·{' '}
                          <Link href={`/fund/${fund.cik}`} style={{ color: B.amber, textDecoration: 'none' }}>SEE ALL →</Link>
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {tradeTarget && (
        <TradeModal symbol={tradeTarget.symbol} currentPrice={tradeTarget.price} maxSellQuantity={0}
          isPaper={isPaper}
          onClose={() => setTradeTarget(null)} onSuccess={() => setTradeTarget(null)} />
      )}

      {basketFund && (
        <BasketModal fundId={basketFund.fund.id} fundName={basketFund.fund.name} holdings={basketFund.selected}
          isPaper={isPaper}
          onClose={() => setBasketFund(null)} />
      )}
    </div>
  );
}

function SearchRow({ name, detail, badge, cik, followed, busy, onFollow }: {
  name: string; detail?: string; badge?: string; cik: string;
  followed: boolean; busy: boolean; onFollow: () => void;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '10px',
      padding: '9px 12px', borderTop: '1px solid var(--bg-161616)', background: 'var(--bg-000000)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <Link href={`/fund/${cik}`} style={{ color: B.amber, fontWeight: 'bold', fontSize: '12.5px', textDecoration: 'none' }}>{name}</Link>
          {badge && <span style={{ color: 'var(--fg-666666)', fontSize: '9px', letterSpacing: '1.5px' }}>{badge}</span>}
        </div>
        {detail && (
          <div style={{ color: B.label, fontSize: '10.5px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>
        )}
      </div>
      {followed ? (
        <span style={{ color: B.green, fontSize: '10px', letterSpacing: '1px', padding: '4px 4px' }}>✓ FOLLOWING</span>
      ) : (
        <button onClick={onFollow} disabled={busy} style={{ ...btnAmber, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'FOLLOWING…' : '+ FOLLOW'}
        </button>
      )}
    </div>
  );
}
