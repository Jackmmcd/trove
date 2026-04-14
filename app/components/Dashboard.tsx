'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine,
  LineChart, Line, Area, AreaChart,
} from 'recharts';
import LoginButton from './LoginButton';
import TradeModal from './TradeModal';
import TickerTooltip from './TickerTooltip';

interface AccountBalance {
  netLiquidity: number;
  totalEquity: number;
  cashAvailableForTrading: number;
  buyingPower: number;
}

interface Position {
  symbol: string;
  quantity: number;
  avgOpenPrice: number;
  currentPrice: number;
  totalValue: number;
  gainLoss: number;
  dailyPnL: number | null;
  weeklyPnL: number | null;
}

const B = {
  bg: '#000',
  panel: '#0d0d0d',
  border: '#2a2a2a',
  borderAmber: '#ff8c00',
  amber: '#ff8c00',
  amberDim: '#cc6d00',
  green: '#00ff41',
  red: '#ff3333',
  cyan: '#00e5ff',
  label: '#888',
  text: '#e0e0e0',
};

const panelStyle: React.CSSProperties = {
  background: B.panel,
  border: `1px solid ${B.border}`,
  padding: '12px 16px',
};

const labelStyle: React.CSSProperties = {
  color: B.label,
  fontSize: '10px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: '4px',
};

const valueStyle: React.CSSProperties = {
  color: B.text,
  fontSize: '20px',
  fontWeight: 'bold',
  letterSpacing: '0.5px',
};

const sectionHeaderStyle: React.CSSProperties = {
  color: B.amber,
  fontSize: '11px',
  fontWeight: 'bold',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  borderBottom: `1px solid ${B.border}`,
  paddingBottom: '6px',
  marginBottom: '10px',
};

const thStyle: React.CSSProperties = {
  color: B.label,
  fontSize: '10px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  padding: '6px 12px',
  textAlign: 'left',
  borderBottom: `1px solid ${B.border}`,
  fontWeight: 'normal',
};

const tdStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderBottom: `1px solid #1a1a1a`,
  fontSize: '13px',
  color: B.text,
};

export default function Dashboard() {
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      setRequiresAuth(false);

      const [balanceRes, positionsRes, histRes] = await Promise.all([
        fetch('/api/tastytrade/balance'),
        fetch('/api/tastytrade/positions'),
        fetch('/api/tastytrade/portfolio-history'),
      ]);

      if (balanceRes.status === 401 || positionsRes.status === 401) {
        const errorData = await balanceRes.json().catch(() => ({}));
        setRequiresAuth(true);
        setError(errorData.error || 'Please log in to view your account data');
        return;
      }

      if (!balanceRes.ok || !positionsRes.ok) throw new Error('Failed to fetch account data');

      const histData = await histRes.json().catch(() => ({}));
      if (histData.success && histData.data?.length > 0) setPortfolioHistory(histData.data);

      const balanceData = await balanceRes.json();
      const positionsData = await positionsRes.json();

      if (balanceData.success) setBalance(balanceData.data);

      if (positionsData.success) {
        const equities = positionsData.data.filter((p: any) => {
          const type = p['instrument-type'] || p.instrumentType || '';
          return type === 'Equity' || type === 'Stock';
        });

        // Build positions with stale close price first so UI renders immediately
        const stalePositions = equities.map((p: any) => {
          const currentPrice = parseFloat(p['close-price'] || p['mark-price'] || '0');
          const avgOpenPrice = parseFloat(p['average-open-price'] || '0');
          const quantity = parseFloat(p.quantity || '0');
          return { symbol: p.symbol, quantity, avgOpenPrice, currentPrice, totalValue: currentPrice * quantity, gainLoss: (currentPrice - avgOpenPrice) * quantity, dailyPnL: null, weeklyPnL: null };
        });
        setPositions(stalePositions);

        if (equities.length > 0) {
          const symbols = equities.map((p: any) => p.symbol).join(',');

          // Fetch live quotes + historical closes in parallel
          const [qData, hData] = await Promise.all([
            fetch(`/api/tastytrade/quotes?symbols=${encodeURIComponent(symbols)}`).then(r => r.json()).catch(() => ({})),
            fetch(`/api/tastytrade/history?symbols=${encodeURIComponent(symbols)}`).then(r => r.json()).catch(() => ({})),
          ]);

          const prices: Record<string, number> = qData.success ? qData.data : {};
          const history: Record<string, { prev1Close: number | null; prev5Close: number | null }> = hData.success ? hData.data : {};

          setPositions(prev => prev.map(p => {
            const livePrice = prices[p.symbol] ?? p.currentPrice;
            const hist = history[p.symbol];
            const dailyPnL = hist?.prev1Close ? (livePrice - hist.prev1Close) * p.quantity : null;
            const weeklyPnL = hist?.prev5Close ? (livePrice - hist.prev5Close) * p.quantity : null;
            return {
              ...p,
              currentPrice: livePrice,
              totalValue: livePrice * p.quantity,
              gainLoss: (livePrice - p.avgOpenPrice) * p.quantity,
              dailyPnL,
              weeklyPnL,
            };
          }));
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px', color: B.amber }}>
        <span style={{ letterSpacing: '2px', fontSize: '12px' }}>LOADING ACCOUNT DATA...</span>
      </div>
    );
  }

  if (error) {
    if (requiresAuth) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px', gap: '16px' }}>
          <div style={{ ...panelStyle, border: `1px solid ${B.amber}`, padding: '24px', textAlign: 'center' }}>
            <p style={{ color: B.amber, marginBottom: '16px', letterSpacing: '1px' }}>{error}</p>
            <LoginButton />
          </div>
        </div>
      );
    }
    return (
      <div style={{ margin: '16px', ...panelStyle, border: `1px solid ${B.red}` }}>
        <p style={{ color: B.red }}>ERROR: {error}</p>
        <button onClick={fetchData} style={{ marginTop: '8px', padding: '6px 16px', background: B.red, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
          RETRY
        </button>
      </div>
    );
  }

  const totalValue = positions.reduce((sum, p) => sum + p.totalValue, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.avgOpenPrice * p.quantity, 0);
  const totalGainLoss = positions.reduce((sum, p) => sum + p.gainLoss, 0);
  const totalReturn = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const totalDailyPnL = positions.every(p => p.dailyPnL !== null) ? positions.reduce((s, p) => s + (p.dailyPnL ?? 0), 0) : null;
  const totalWeeklyPnL = positions.every(p => p.weeklyPnL !== null) ? positions.reduce((s, p) => s + (p.weeklyPnL ?? 0), 0) : null;

  const chartData = positions.map(p => ({
    symbol: p.symbol,
    cost: parseFloat((p.avgOpenPrice * p.quantity).toFixed(2)),
    value: parseFloat(p.totalValue.toFixed(2)),
    gainLoss: parseFloat(p.gainLoss.toFixed(2)),
  }));

  const formatCurrency = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

  const tooltipStyle = {
    backgroundColor: '#0d0d0d',
    border: `1px solid ${B.amber}`,
    fontFamily: 'Courier New, monospace',
    fontSize: '13px',
  };
  const tooltipLabelStyle = { color: B.amber, fontWeight: 'bold', letterSpacing: '1px', marginBottom: '4px' };
  const tooltipItemStyle = { color: '#ffffff', fontWeight: 'bold', fontSize: '14px' };

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: B.amber, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>
          ACCOUNT OVERVIEW
        </div>
        <LoginButton />
      </div>

      {/* Balance tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { label: 'Net Liquidity', value: balance?.netLiquidity },
          { label: 'Total Equity', value: balance?.totalEquity },
          { label: 'Cash Available', value: balance?.cashAvailableForTrading },
          { label: 'Buying Power', value: balance?.buyingPower },
        ].map(({ label, value }) => (
          <div key={label} style={panelStyle}>
            <div style={labelStyle}>{label}</div>
            <div style={valueStyle}>
              ${value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
            </div>
          </div>
        ))}
      </div>

      {positions.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ ...panelStyle, display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center', borderColor: B.amberDim }}>
            <div>
              <div style={labelStyle}>Total Invested</div>
              <div style={{ color: B.text, fontSize: '16px', fontWeight: 'bold' }}>
                ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Current Value</div>
              <div style={{ color: B.cyan, fontSize: '16px', fontWeight: 'bold' }}>
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Total P&L</div>
              <div style={{ color: totalGainLoss >= 0 ? B.green : B.red, fontSize: '16px', fontWeight: 'bold' }}>
                {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
              </div>
            </div>
            {totalDailyPnL !== null && (() => {
              const prevVal = totalValue - totalDailyPnL;
              const pct = prevVal > 0 ? (totalDailyPnL / prevVal) * 100 : 0;
              return (
                <div>
                  <div style={labelStyle}>Day P&L</div>
                  <div style={{ color: totalDailyPnL >= 0 ? B.green : B.red, fontSize: '16px', fontWeight: 'bold' }}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                  </div>
                </div>
              );
            })()}
            {totalWeeklyPnL !== null && (() => {
              const prevVal = totalValue - totalWeeklyPnL;
              const pct = prevVal > 0 ? (totalWeeklyPnL / prevVal) * 100 : 0;
              return (
                <div>
                  <div style={labelStyle}>Week P&L</div>
                  <div style={{ color: totalWeeklyPnL >= 0 ? B.green : B.red, fontSize: '16px', fontWeight: 'bold' }}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Portfolio value line chart */}
          {portfolioHistory.length > 1 && (() => {
            const first = portfolioHistory[0].value;
            const last = portfolioHistory[portfolioHistory.length - 1].value;
            const isUp = last >= first;
            const lineColor = isUp ? B.green : B.red;
            const minVal = Math.min(...portfolioHistory.map(d => d.value));
            const maxVal = Math.max(...portfolioHistory.map(d => d.value));
            const pad = (maxVal - minVal) * 0.1 || maxVal * 0.05;
            // Show only ~8 x-axis labels
            const labelStep = Math.max(1, Math.floor(portfolioHistory.length / 8));
            return (
              <div style={panelStyle}>
                <div style={sectionHeaderStyle}>PORTFOLIO VALUE — 3 MONTHS</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={portfolioHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={lineColor} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#1a1a1a" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#888', fontFamily: 'Courier New' }}
                      tickFormatter={(v, i) => i % labelStep === 0 ? v.slice(5) : ''}
                      interval={0}
                    />
                    <YAxis
                      domain={[minVal - pad, maxVal + pad]}
                      tickFormatter={formatCurrency}
                      tick={{ fontSize: 10, fill: '#888', fontFamily: 'Courier New' }}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Portfolio']}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={lineColor}
                      strokeWidth={2}
                      fill="url(#portfolioGrad)"
                      dot={false}
                      activeDot={{ r: 3, fill: lineColor }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={panelStyle}>
              <div style={sectionHeaderStyle}>COST BASIS vs CURRENT VALUE</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#1a1a1a" />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: '#888', fontFamily: 'Courier New' }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10, fill: '#888', fontFamily: 'Courier New' }} width={52} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, undefined]} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Legend wrapperStyle={{ fontSize: '10px', color: '#888', fontFamily: 'Courier New' }} />
                  <Bar dataKey="cost" name="Cost Basis" fill="#444" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="value" name="Current Value" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.value >= entry.cost ? '#00ff41' : '#ff3333'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={panelStyle}>
              <div style={sectionHeaderStyle}>GAIN / LOSS BY POSITION</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#1a1a1a" />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: '#888', fontFamily: 'Courier New' }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10, fill: '#888', fontFamily: 'Courier New' }} width={52} />
                  <Tooltip formatter={(v: number) => [`${v >= 0 ? '+' : ''}$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'P&L']} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <ReferenceLine y={0} stroke="#444" strokeWidth={1} />
                  <Bar dataKey="gainLoss" name="Gain / Loss" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.gainLoss >= 0 ? '#00ff41' : '#ff3333'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Positions table */}
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={sectionHeaderStyle}>CURRENT POSITIONS</div>
          <span style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>CLICK ROW TO TRADE</span>
        </div>
        {positions.length === 0 ? (
          <p style={{ color: B.label, fontSize: '12px' }}>NO POSITIONS FOUND</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Symbol', 'Shares', 'Avg Cost', 'Last Price', 'Value', 'Day P&L', 'Week P&L', 'Total P&L'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr
                    key={p.symbol}
                    onClick={() => setSelectedPosition(p)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a1a00')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold' }}>
                      <TickerTooltip ticker={p.symbol}>{p.symbol}</TickerTooltip>
                    </td>
                    <td style={tdStyle}>{p.quantity}</td>
                    <td style={tdStyle}>${p.avgOpenPrice.toFixed(2)}</td>
                    <td style={{ ...tdStyle, color: B.cyan }}>${p.currentPrice.toFixed(2)}</td>
                    <td style={tdStyle}>${p.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ ...tdStyle, color: p.dailyPnL === null ? B.label : p.dailyPnL >= 0 ? B.green : B.red, fontWeight: 'bold' }}>
                      {p.dailyPnL === null ? '—' : `${p.dailyPnL >= 0 ? '+' : ''}$${p.dailyPnL.toFixed(2)}`}
                    </td>
                    <td style={{ ...tdStyle, color: p.weeklyPnL === null ? B.label : p.weeklyPnL >= 0 ? B.green : B.red, fontWeight: 'bold' }}>
                      {p.weeklyPnL === null ? '—' : `${p.weeklyPnL >= 0 ? '+' : ''}$${p.weeklyPnL.toFixed(2)}`}
                    </td>
                    <td style={{ ...tdStyle, color: p.gainLoss >= 0 ? B.green : B.red, fontWeight: 'bold' }}>
                      {p.gainLoss >= 0 ? '+' : ''}${p.gainLoss.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `1px solid ${B.border}` }}>
                  <td colSpan={4} style={{ ...tdStyle, color: B.label, fontSize: '10px', letterSpacing: '1px' }}>TOTAL</td>
                  <td style={{ ...tdStyle, color: B.cyan, fontWeight: 'bold' }}>
                    ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ ...tdStyle, color: totalDailyPnL === null ? B.label : totalDailyPnL >= 0 ? B.green : B.red, fontWeight: 'bold' }}>
                    {totalDailyPnL === null ? '—' : `${totalDailyPnL >= 0 ? '+' : ''}$${totalDailyPnL.toFixed(2)}`}
                  </td>
                  <td style={{ ...tdStyle, color: totalWeeklyPnL === null ? B.label : totalWeeklyPnL >= 0 ? B.green : B.red, fontWeight: 'bold' }}>
                    {totalWeeklyPnL === null ? '—' : `${totalWeeklyPnL >= 0 ? '+' : ''}$${totalWeeklyPnL.toFixed(2)}`}
                  </td>
                  <td style={{ ...tdStyle, color: totalGainLoss >= 0 ? B.green : B.red, fontWeight: 'bold' }}>
                    {totalGainLoss >= 0 ? '+' : ''}${totalGainLoss.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {selectedPosition && (
        <TradeModal
          symbol={selectedPosition.symbol}
          currentPrice={selectedPosition.currentPrice}
          maxSellQuantity={selectedPosition.quantity}
          onClose={() => setSelectedPosition(null)}
          onSuccess={() => { setSelectedPosition(null); fetchData(); }}
        />
      )}
    </div>
  );
}
