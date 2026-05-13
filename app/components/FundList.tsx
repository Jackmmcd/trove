'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TradeModal from './TradeModal';
import BasketModal from './BasketModal';
import TickerTooltip from './TickerTooltip';

interface Holding {
  ticker: string;
  shares: number;
  value: number;
  weight: number;
}

interface Fund {
  id: string;
  cik: string;
  name: string;
  enabled: boolean;
  holdings: Holding[];
  thesis: string | null;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let toastId = 0;

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', amberDim: '#cc6d00',
  green: '#00ff41', red: '#ff3333', cyan: '#00e5ff',
  label: '#888', text: '#e0e0e0',
};

const panelStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.border}` };
const btnAmber: React.CSSProperties = { padding: '4px 12px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' };
const btnGhost: React.CSSProperties = { padding: '4px 12px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' };
const btnRed: React.CSSProperties = { padding: '4px 12px', background: 'transparent', color: B.red, border: `1px solid #4a0000`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' };
const thStyle: React.CSSProperties = { color: B.label, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', padding: '5px 10px', textAlign: 'left', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal' };
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid #111', fontSize: '12px', color: B.text };

export default function FundList() {
  const router = useRouter();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingCik, setSyncingCik] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<{ symbol: string; price: number } | null>(null);
  const [basketFund, setBasketFund] = useState<{ fund: Fund; selected: Holding[] } | null>(null);
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [hoveredFund, setHoveredFund] = useState<string | null>(null);

  function toggleCollapsed(fundId: string) {
    setCollapsedMap(prev => ({ ...prev, [fundId]: !prev[fundId] }));
  }

  const [addCik, setAddCik] = useState('');
  const [addName, setAddName] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => { fetchFunds(); }, []);

  function toast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  async function fetchFunds() {
    try {
      setLoading(true);
      const res = await fetch('/api/funds');
      const data = await res.json();
      if (data.success) setFunds(data.data);
    } catch { toast('FAILED TO LOAD FUNDS', 'error'); } finally { setLoading(false); }
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
        await fetchFunds();
      } else toast(data.error || 'SYNC FAILED', 'error');
    } catch { toast('SYNC FAILED', 'error'); } finally { setSyncing(false); }
  }

  async function syncOne(cik: string, name: string) {
    setSyncingCik(cik);
    try {
      const res = await fetch(`/api/funds/${cik}`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) { toast(`${name} — ${data.data.holdingsCount} HOLDINGS (${data.data.quarter})`); await fetchFunds(); }
      else toast(data.error || `SYNC FAILED: ${name}`, 'error');
    } catch { toast(`SYNC FAILED: ${name}`, 'error'); } finally { setSyncingCik(null); }
  }

  async function toggleEnabled(cik: string, name: string, currentlyEnabled: boolean) {
    try {
      const res = await fetch(`/api/funds/${cik}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !currentlyEnabled }) });
      const data = await res.json();
      if (data.success) { setFunds(prev => prev.map(f => f.cik === cik ? { ...f, enabled: !currentlyEnabled } : f)); }
      else toast(data.error || 'UPDATE FAILED', 'error');
    } catch { toast('UPDATE FAILED', 'error'); }
  }

  async function deleteFund(cik: string, name: string) {
    if (!confirm(`REMOVE ${name.toUpperCase()} AND ALL HOLDINGS?`)) return;
    try {
      const res = await fetch(`/api/funds/${cik}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast(`${name.toUpperCase()} REMOVED`); setFunds(prev => prev.filter(f => f.cik !== cik)); }
      else toast(data.error || 'DELETE FAILED', 'error');
    } catch { toast('DELETE FAILED', 'error'); }
  }

  async function lookupCik() {
    const cik = addCik.trim().replace(/^0+/, '');
    if (!cik || !/^\d+$/.test(cik)) { toast('ENTER A NUMERIC CIK', 'error'); return; }
    setLookingUp(true);
    try {
      const res = await fetch(`/api/sec/lookup?cik=${cik}`);
      const data = await res.json();
      if (data.success) { setAddName(data.data.name); setAddCik(data.data.cik); }
      else toast(data.error || 'CIK NOT FOUND', 'error');
    } catch { toast('LOOKUP FAILED', 'error'); } finally { setLookingUp(false); }
  }

  async function addFund() {
    const cik = addCik.trim(); const name = addName.trim();
    if (!cik || !name) { toast('CIK AND NAME REQUIRED', 'error'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/funds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cik, name }) });
      const data = await res.json();
      if (data.success) { toast(`${name.toUpperCase()} ADDED`); setShowAddForm(false); setAddCik(''); setAddName(''); await fetchFunds(); }
      else toast(data.error || 'FAILED TO ADD FUND', 'error');
    } catch { toast('FAILED TO ADD FUND', 'error'); } finally { setAdding(false); }
  }

  function getSelected(fundId: string, holdings: Holding[]): Set<string> {
    return selectedMap[fundId] ?? new Set(holdings.map(h => h.ticker));
  }

  function toggleTicker(fundId: string, ticker: string, holdings: Holding[]) {
    const current = new Set(getSelected(fundId, holdings));
    if (current.has(ticker)) current.delete(ticker); else current.add(ticker);
    setSelectedMap(prev => ({ ...prev, [fundId]: current }));
  }

  function toggleAll(fundId: string, holdings: Holding[]) {
    const current = getSelected(fundId, holdings);
    const next = current.size === holdings.length ? new Set<string>() : new Set(holdings.map(h => h.ticker));
    setSelectedMap(prev => ({ ...prev, [fundId]: next }));
  }

  const inputStyle: React.CSSProperties = { background: '#000', border: `1px solid ${B.border}`, color: B.amber, padding: '6px 10px', fontFamily: 'Courier New, monospace', fontSize: '12px', outline: 'none', flex: 1 };

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
      <div style={{ position: 'fixed', top: '52px', right: '12px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ padding: '8px 14px', background: t.type === 'success' ? '#001a00' : '#1a0000', border: `1px solid ${t.type === 'success' ? B.green : B.red}`, color: t.type === 'success' ? B.green : B.red, fontSize: '11px', letterSpacing: '1px', maxWidth: '280px' }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: B.amber, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>FOLLOWED FUNDS</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowAddForm(v => !v)} style={btnAmber}>+ ADD FUND</button>
          <button onClick={syncAll} disabled={syncing || funds.filter(f => f.enabled).length === 0}
            style={{ ...btnGhost, color: syncing ? B.label : B.cyan, borderColor: syncing ? B.border : '#004a5a', opacity: (syncing || funds.filter(f => f.enabled).length === 0) ? 0.5 : 1 }}>
            {syncing ? 'SYNCING...' : 'SYNC ALL'}
          </button>
        </div>
      </div>

      {/* Add Fund Form */}
      {showAddForm && (
        <div style={{ ...panelStyle, padding: '16px', borderColor: B.amberDim, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ color: B.amber, fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px' }}>ADD FUND BY CIK</div>
          <p style={{ color: B.label, fontSize: '11px', letterSpacing: '0.5px' }}>
            Enter the SEC CIK number.{' '}
            <a href="https://www.sec.gov/search-filings" target="_blank" rel="noopener noreferrer" style={{ color: B.cyan, textDecoration: 'none' }}>
              FIND ON SEC EDGAR ↗
            </a>
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="CIK e.g. 1067983" value={addCik} onChange={e => { setAddCik(e.target.value); setAddName(''); }} style={inputStyle} />
            <button onClick={lookupCik} disabled={lookingUp || !addCik.trim()} style={{ ...btnGhost, opacity: lookingUp || !addCik.trim() ? 0.5 : 1 }}>
              {lookingUp ? 'LOOKING UP...' : 'LOOKUP'}
            </button>
          </div>
          {addName && (
            <div style={{ background: '#001a00', border: `1px solid ${B.green}`, padding: '6px 12px', color: B.green, fontSize: '11px', letterSpacing: '1px' }}>
              ✓ {addName}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowAddForm(false); setAddCik(''); setAddName(''); }} style={btnGhost}>CANCEL</button>
            <button onClick={addFund} disabled={adding || !addCik.trim() || !addName.trim()} style={{ ...btnAmber, opacity: adding || !addCik.trim() || !addName.trim() ? 0.5 : 1 }}>
              {adding ? 'ADDING...' : 'ADD FUND'}
            </button>
          </div>
        </div>
      )}

      {/* Fund list */}
      {funds.length === 0 ? (
        <div style={{ ...panelStyle, padding: '48px', textAlign: 'center' }}>
          <p style={{ color: B.label, fontSize: '12px', letterSpacing: '1px' }}>NO FUNDS ADDED</p>
          <p style={{ color: '#444', fontSize: '11px', marginTop: '6px' }}>CLICK + ADD FUND TO GET STARTED</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {funds.map(fund => {
            const isSyncingThis = syncingCik === fund.cik;
            const isExpanded = !!collapsedMap[fund.id];
            return (
              <div key={fund.id} style={{ ...panelStyle, opacity: fund.enabled ? 1 : 0.5 }} onMouseEnter={() => setHoveredFund(fund.id)} onMouseLeave={() => setHoveredFund(null)}>
                {/* Fund header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: isExpanded ? `1px solid ${B.border}` : 'none' }}>
                  <button onClick={() => toggleCollapsed(fund.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0, textAlign: 'left' }}>
                    <span style={{ color: B.amber, fontSize: '10px', userSelect: 'none' }}>{isExpanded ? '▼' : '▶'}</span>
                    <div>
                      <div style={{ color: B.amber, fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px', fontFamily: 'Courier New, monospace' }}>{fund.name.toUpperCase()}</div>
                      <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>CIK: {fund.cik}</div>
                    </div>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '10px', letterSpacing: '1px', padding: '2px 8px', border: `1px solid ${fund.enabled ? '#004400' : B.border}`, color: fund.enabled ? B.green : B.label }}>
                      {fund.enabled ? 'ACTIVE' : 'DISABLED'}
                    </span>
                    <button onClick={() => toggleEnabled(fund.cik, fund.name, fund.enabled)} style={btnGhost}>
                      {fund.enabled ? 'DISABLE' : 'ENABLE'}
                    </button>
                    <button onClick={() => syncOne(fund.cik, fund.name)} disabled={isSyncingThis}
                      style={{ ...btnGhost, color: B.cyan, borderColor: '#004a5a', opacity: isSyncingThis ? 0.5 : 1 }}>
                      {isSyncingThis ? 'SYNCING...' : 'SYNC'}
                    </button>
                    <button onClick={() => deleteFund(fund.cik, fund.name)} style={btnRed}>REMOVE</button>
                  </div>
                </div>

                {/* Fund thesis — revealed on hover */}
                {fund.thesis && (
                  <div style={{
                    overflow: 'hidden',
                    maxHeight: hoveredFund === fund.id ? '300px' : '0px',
                    opacity: hoveredFund === fund.id ? 1 : 0,
                    transition: 'max-height 0.35s ease, opacity 0.25s ease',
                    borderBottom: hoveredFund === fund.id ? `1px solid ${B.border}` : 'none',
                    background: '#050505',
                  }}>
                    <p style={{ color: '#aaa', fontSize: '14px', lineHeight: 1.9, margin: 0, padding: '14px 16px', letterSpacing: '0.3px' }}>{fund.thesis}</p>
                  </div>
                )}

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
                  const allChecked = selected.size === fund.holdings.length;
                  const someChecked = selected.size > 0 && !allChecked;
                  const selectedHoldings = fund.holdings.filter(h => selected.has(h.ticker));
                  return (
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>
                          {fund.holdings.length} HOLDINGS — {selected.size} SELECTED
                        </span>
                        <button
                          onClick={() => setBasketFund({ fund, selected: selectedHoldings })}
                          disabled={selectedHoldings.length === 0}
                          style={{ ...btnAmber, background: selectedHoldings.length === 0 ? '#333' : B.green, color: '#000', opacity: selectedHoldings.length === 0 ? 0.4 : 1 }}
                        >
                          BUY BASKET{selected.size < fund.holdings.length ? ` (${selected.size})` : ''}
                        </button>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                              const checked = selected.has(h.ticker);
                              return (
                                <tr key={idx} onClick={() => toggleTicker(fund.id, h.ticker, fund.holdings)}
                                  style={{ cursor: 'pointer', opacity: checked ? 1 : 0.35 }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#1a1a00')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <td style={{ ...tdStyle, width: '32px' }} onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={checked} onChange={() => toggleTicker(fund.id, h.ticker, fund.holdings)} style={{ cursor: 'pointer', accentColor: B.amber }} />
                                  </td>
                                  <td style={{ ...tdStyle, color: B.label, fontSize: '10px' }}>{idx + 1}</td>
                                  <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold', letterSpacing: '1px' }} onClick={e => e.stopPropagation()}>
                                    <TickerTooltip ticker={h.ticker}>
                                      <span
                                        onClick={() => router.push(`/stock/${h.ticker}`)}
                                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#ff8c0066' }}
                                      >
                                        {h.ticker}
                                      </span>
                                    </TickerTooltip>
                                  </td>
                                  <td style={tdStyle}>{h.shares.toLocaleString()}</td>
                                  <td style={{ ...tdStyle, color: B.cyan }}>
                                    ${(h.value / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M
                                  </td>
                                  <td style={tdStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ width: '60px', background: '#1a1a1a', height: '3px', position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(h.weight, 100)}%`, background: B.amber }} />
                                      </div>
                                      <span style={{ color: B.label, fontSize: '11px' }}>{h.weight.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                  <td style={tdStyle} onClick={e => e.stopPropagation()}>
                                    <button onClick={() => setTradeTarget({ symbol: h.ticker, price: 0 })}
                                      style={{ padding: '2px 8px', background: B.green, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px' }}>
                                      BUY
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {fund.holdings.length > 15 && (
                        <p style={{ color: B.label, fontSize: '10px', letterSpacing: '1px', textAlign: 'right', marginTop: '6px' }}>
                          SHOWING 15 OF {fund.holdings.length} HOLDINGS
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
          onClose={() => setTradeTarget(null)} onSuccess={() => setTradeTarget(null)} />
      )}

      {basketFund && (
        <BasketModal fundId={basketFund.fund.id} fundName={basketFund.fund.name} holdings={basketFund.selected}
          onClose={() => setBasketFund(null)} />
      )}
    </div>
  );
}
