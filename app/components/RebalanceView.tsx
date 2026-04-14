'use client';

import { useEffect, useState } from 'react';

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', amberDim: '#cc6d00',
  green: '#00ff41', red: '#ff3333', cyan: '#00e5ff',
  label: '#888', text: '#e0e0e0',
};

interface RebalanceTrade {
  ticker: string;
  action: 'buy' | 'sell';
  shares: number;
  currentShares: number;
  targetShares: number;
  currentValue: number;
  targetValue: number;
  tradeValue: number;
  deviation: number;
}

interface RebalanceResult {
  currentPositions: Array<{ ticker: string; shares: number; currentPrice: number; currentValue: number; currentWeight: number }>;
  targetWeights: Array<{ ticker: string; weight: number; targetValue: number }>;
  trades: RebalanceTrade[];
  totalPortfolioValue: number;
  availableCash: number;
  totalTradeValue: number;
}

interface BasketOrder { ticker: string; shares: number; price: number; status: string }
interface BasketPurchase {
  id: string;
  fundId: string;
  fundName: string;
  budget: number;
  placedAt: string;
  orders: BasketOrder[];
}

interface FilingAlert {
  fundId: string;
  cik: string;
  fundName: string;
  newFilingDate: string;
  newQuarter: string;
  currentQuarter: string | null;
}

export default function RebalanceView() {
  const [result, setResult] = useState<RebalanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState(5);

  const [baskets, setBaskets] = useState<BasketPurchase[]>([]);
  const [basketsLoading, setBasketsLoading] = useState(true);

  const [alerts, setAlerts] = useState<FilingAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [syncingCik, setSyncingCik] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, 'ok' | 'err'>>({});

  const [expandedBasket, setExpandedBasket] = useState<string | null>(null);

  useEffect(() => { calculateRebalance(); }, [threshold]);

  useEffect(() => {
    fetch('/api/baskets')
      .then(r => r.json())
      .then(d => { if (d.success) setBaskets(d.data); })
      .catch(() => {})
      .finally(() => setBasketsLoading(false));

    fetch('/api/notifications/13f')
      .then(r => r.json())
      .then(d => { if (d.success) setAlerts(d.data); })
      .catch(() => {})
      .finally(() => setAlertsLoading(false));
  }, []);

  const calculateRebalance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rebalance/calculate?rebalanceThreshold=${threshold}`);
      const data = await res.json();
      if (data.success) setResult(data.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  async function syncFund(alert: FilingAlert) {
    setSyncingCik(alert.cik);
    try {
      const res = await fetch(`/api/funds/${alert.cik}`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        setSyncResults(prev => ({ ...prev, [alert.cik]: 'ok' }));
        setAlerts(prev => prev.filter(a => a.cik !== alert.cik));
      } else {
        setSyncResults(prev => ({ ...prev, [alert.cik]: 'err' }));
      }
    } catch {
      setSyncResults(prev => ({ ...prev, [alert.cik]: 'err' }));
    } finally {
      setSyncingCik(null);
    }
  }

  const buyTrades = result?.trades.filter(t => t.action === 'buy') ?? [];
  const sellTrades = result?.trades.filter(t => t.action === 'sell') ?? [];

  const thStyle: React.CSSProperties = { color: B.label, fontSize: '10px', letterSpacing: '1px', padding: '5px 10px', textAlign: 'left', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal', textTransform: 'uppercase' };
  const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid #111', fontSize: '12px', color: B.text };
  const sectionHeader: React.CSSProperties = { background: '#111', borderBottom: `1px solid ${B.border}`, padding: '6px 14px', color: B.amber, fontSize: '11px', letterSpacing: '2px', fontWeight: 'bold' };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Courier New, monospace' }}>

      {/* ── 13F FILING ALERTS ─────────────────────────────── */}
      <div style={{ border: `1px solid ${B.border}`, background: B.panel }}>
        <div style={sectionHeader}>13F FILING ALERTS</div>
        {alertsLoading ? (
          <div style={{ padding: '16px', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>CHECKING EDGAR...</div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: '16px', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>
            {Object.keys(syncResults).length > 0 ? '✓ ALL FUNDS UP TO DATE' : 'NO NEW FILINGS DETECTED'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {alerts.map(alert => (
              <div key={alert.cik} style={{ padding: '10px 14px', borderBottom: `1px solid ${B.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ color: B.amber, fontWeight: 'bold', fontSize: '12px' }}>{alert.fundName}</span>
                  <span style={{ color: B.label, fontSize: '10px', marginLeft: '10px', letterSpacing: '1px' }}>CIK {alert.cik}</span>
                  <div style={{ color: B.text, fontSize: '11px', marginTop: '2px' }}>
                    <span style={{ color: B.cyan }}>{alert.newQuarter}</span>
                    <span style={{ color: B.label }}> filed {alert.newFilingDate}</span>
                    {alert.currentQuarter && (
                      <span style={{ color: B.label }}> · stored: {alert.currentQuarter}</span>
                    )}
                    {!alert.currentQuarter && (
                      <span style={{ color: B.label }}> · no data stored</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {syncResults[alert.cik] === 'err' && (
                    <span style={{ color: B.red, fontSize: '10px', letterSpacing: '1px' }}>SYNC FAILED</span>
                  )}
                  <button
                    onClick={() => syncFund(alert)}
                    disabled={syncingCik === alert.cik}
                    style={{ padding: '5px 14px', background: syncingCik === alert.cik ? '#333' : B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px', opacity: syncingCik === alert.cik ? 0.6 : 1 }}
                  >
                    {syncingCik === alert.cik ? 'SYNCING...' : 'SYNC NOW'}
                  </button>
                  <button
                    onClick={() => { syncFund(alert).then(() => calculateRebalance()); }}
                    disabled={syncingCik === alert.cik}
                    style={{ padding: '5px 14px', background: 'transparent', color: B.green, border: `1px solid ${B.green}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px', opacity: syncingCik === alert.cik ? 0.5 : 1 }}
                  >
                    SYNC + REBALANCE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── BASKET PURCHASE HISTORY ───────────────────────── */}
      <div style={{ border: `1px solid ${B.border}`, background: B.panel }}>
        <div style={sectionHeader}>BASKET PURCHASE HISTORY</div>
        {basketsLoading ? (
          <div style={{ padding: '16px', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>LOADING...</div>
        ) : baskets.length === 0 ? (
          <div style={{ padding: '16px', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>NO BASKET PURCHASES RECORDED</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Fund</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Budget</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Positions</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Deployed</th>
                <th style={{ ...thStyle }}></th>
              </tr>
            </thead>
            <tbody>
              {baskets.map(b => {
                const orders = Array.isArray(b.orders) ? b.orders as BasketOrder[] : [];
                const filled = orders.filter(o => o.status === 'done');
                const deployed = filled.reduce((s, o) => s + o.shares * o.price, 0);
                const isExpanded = expandedBasket === b.id;
                return (
                  <>
                    <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedBasket(isExpanded ? null : b.id)}>
                      <td style={{ ...tdStyle, color: B.label, fontSize: '11px' }}>
                        {new Date(b.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}
                        <span style={{ color: '#444' }}>{new Date(b.placedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold' }}>{b.fundName}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.text }}>${b.budget.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.cyan }}>{filled.length}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.green, fontWeight: 'bold' }}>${deployed.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: B.label, fontSize: '10px' }}>{isExpanded ? '▲' : '▼'}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${b.id}-detail`}>
                        <td colSpan={6} style={{ padding: '0 0 0 32px', background: '#080808', borderBottom: '1px solid #111' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ ...thStyle, fontSize: '9px' }}>Ticker</th>
                                <th style={{ ...thStyle, textAlign: 'right', fontSize: '9px' }}>Shares</th>
                                <th style={{ ...thStyle, textAlign: 'right', fontSize: '9px' }}>Price</th>
                                <th style={{ ...thStyle, textAlign: 'right', fontSize: '9px' }}>Total</th>
                                <th style={{ ...thStyle, fontSize: '9px' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.map(o => (
                                <tr key={o.ticker}>
                                  <td style={{ ...tdStyle, color: B.amber, fontSize: '11px' }}>{o.ticker}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>{o.shares}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right', color: B.cyan, fontSize: '11px' }}>${o.price.toFixed(2)}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right', color: B.text, fontSize: '11px' }}>${(o.shares * o.price).toFixed(2)}</td>
                                  <td style={{ ...tdStyle, fontSize: '10px', color: o.status === 'done' ? B.green : o.status === 'error' ? B.red : B.label }}>
                                    {o.status === 'done' ? '✓ FILLED' : o.status === 'error' ? '✗ ERROR' : o.status.toUpperCase()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── REBALANCE CALCULATOR ──────────────────────────── */}
      <div style={{ border: `1px solid ${B.border}`, background: B.panel }}>
        <div style={{ ...sectionHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>REBALANCE CALCULATOR</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: B.label, fontSize: '10px' }}>THRESHOLD</span>
            <input
              type="range" min={1} max={20} value={threshold}
              onChange={e => setThreshold(parseInt(e.target.value))}
              style={{ accentColor: B.amber, width: '80px' }}
            />
            <span style={{ color: B.amber, minWidth: '28px' }}>{threshold}%</span>
            <button onClick={calculateRebalance} style={{ padding: '3px 12px', background: 'transparent', color: B.amber, border: `1px solid ${B.amber}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '10px', letterSpacing: '1px' }}>
              {loading ? 'LOADING...' : 'CALC'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '20px', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>CALCULATING...</div>
        ) : !result ? (
          <div style={{ padding: '20px', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>NO REBALANCE DATA</div>
        ) : (
          <>
            {/* Stats row */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${B.border}` }}>
              {[
                { label: 'PORTFOLIO VALUE', value: `$${result.totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: B.text },
                { label: 'AVAILABLE CASH', value: `$${result.availableCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: B.green },
                { label: 'TRADE VALUE', value: `$${result.totalTradeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: B.amber },
              ].map(stat => (
                <div key={stat.label} style={{ flex: 1, padding: '10px 14px', borderRight: `1px solid ${B.border}` }}>
                  <div style={{ color: B.label, fontSize: '9px', letterSpacing: '1px' }}>{stat.label}</div>
                  <div style={{ color: stat.color, fontSize: '16px', fontWeight: 'bold', marginTop: '2px' }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {result.trades.length === 0 ? (
              <div style={{ padding: '20px', color: B.label, fontSize: '11px', letterSpacing: '1px' }}>✓ PORTFOLIO ALIGNED — NO TRADES NEEDED</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: sellTrades.length > 0 && buyTrades.length > 0 ? '1fr 1fr' : '1fr', gap: '0' }}>
                {sellTrades.length > 0 && (
                  <div style={{ borderRight: buyTrades.length > 0 ? `1px solid ${B.border}` : 'none' }}>
                    <div style={{ padding: '6px 14px', background: '#0a0000', color: B.red, fontSize: '10px', letterSpacing: '2px', borderBottom: `1px solid ${B.border}` }}>
                      SELL · {sellTrades.length} POSITIONS
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Ticker</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Curr</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Target</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Sell</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sellTrades.map(t => (
                          <tr key={t.ticker}>
                            <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold' }}>{t.ticker}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{t.currentShares.toFixed(2)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: B.label }}>{t.targetShares.toFixed(2)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: B.red, fontWeight: 'bold' }}>{t.shares.toFixed(2)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>${t.tradeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {buyTrades.length > 0 && (
                  <div>
                    <div style={{ padding: '6px 14px', background: '#000a00', color: B.green, fontSize: '10px', letterSpacing: '2px', borderBottom: `1px solid ${B.border}` }}>
                      BUY · {buyTrades.length} POSITIONS
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Ticker</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Curr</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Target</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Buy</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buyTrades.map(t => (
                          <tr key={t.ticker}>
                            <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold' }}>{t.ticker}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{t.currentShares.toFixed(2)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: B.label }}>{t.targetShares.toFixed(2)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: B.green, fontWeight: 'bold' }}>{t.shares.toFixed(2)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>${t.tradeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
