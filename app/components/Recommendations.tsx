'use client';

import { useEffect, useState } from 'react';
import TickerTooltip from './TickerTooltip';
import TradeModal from './TradeModal';

interface Recommendation {
  ticker: string;
  score: number;
  fundCount: number;
  aggregateWeight: number;
  averageWeight: number;
  totalValue: number;
  recentAdditions: number;
  reasons: string[];
}

const B = {
  panel: '#0d0d0d', border: '#2a2a2a', amber: '#ff8c00',
  green: '#00ff41', red: '#ff3333', cyan: '#00e5ff',
  label: '#888', text: '#e0e0e0',
};

export default function Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [tradeTarget, setTradeTarget] = useState<string | null>(null);

  useEffect(() => { fetchRecommendations(); }, [limit]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/recommendations?limit=${limit}`);
      const data = await response.json();
      if (data.success) setRecommendations(data.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const panelStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.border}`, padding: '12px 16px' };
  const thStyle: React.CSSProperties = { color: B.label, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', padding: '6px 12px', textAlign: 'left', borderBottom: `1px solid ${B.border}`, fontWeight: 'normal' };
  const tdStyle: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid #1a1a1a', fontSize: '12px', color: B.text };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px', color: B.amber }}>
        <span style={{ letterSpacing: '2px', fontSize: '12px' }}>COMPUTING SIGNALS...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: B.amber, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>BUY SIGNALS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: B.label, fontSize: '11px', letterSpacing: '1px' }}>LIMIT</span>
          <input
            type="number" min={5} max={50} value={limit}
            onChange={e => setLimit(parseInt(e.target.value))}
            style={{ background: '#000', border: `1px solid ${B.border}`, color: B.amber, padding: '4px 8px', width: '64px', fontFamily: 'Courier New, monospace', fontSize: '12px', outline: 'none' }}
          />
          <button
            onClick={fetchRecommendations}
            style={{ padding: '5px 14px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' }}
          >
            REFRESH
          </button>
        </div>
      </div>

      {recommendations.length === 0 ? (
        <div style={{ ...panelStyle, padding: '32px', textAlign: 'center' }}>
          <p style={{ color: B.label, letterSpacing: '1px', fontSize: '12px' }}>NO SIGNALS — SYNC FUNDS FIRST</p>
        </div>
      ) : (
        <div style={panelStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Rank', 'Ticker', 'Score', 'Funds', 'Agg Weight', 'Total Value', 'New', 'Signal'].map(h => (
                    <th key={h} style={thStyle as React.ThHTMLAttributes<HTMLTableHeaderCellElement>['style']}>{h}</th>
                  ))}
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec, index) => (
                  <tr
                    key={rec.ticker}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a1a00')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...tdStyle, color: B.label }}>{index + 1}</td>
                    <td style={{ ...tdStyle, color: B.amber, fontWeight: 'bold', letterSpacing: '1px' }}>
                      <TickerTooltip ticker={rec.ticker}>{rec.ticker}</TickerTooltip>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: '#1a1000', border: `1px solid ${B.amber}`, color: B.amber, padding: '2px 8px', fontSize: '11px', letterSpacing: '1px' }}>
                        {rec.score.toFixed(1)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: B.cyan }}>{rec.fundCount}</td>
                    <td style={tdStyle}>{rec.aggregateWeight.toFixed(2)}%</td>
                    <td style={tdStyle}>
                      ${rec.totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td style={tdStyle}>
                      {rec.recentAdditions > 0 ? (
                        <span style={{ color: B.green, fontWeight: 'bold' }}>+{rec.recentAdditions}</span>
                      ) : (
                        <span style={{ color: B.label }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: '240px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {rec.reasons.map((r, i) => (
                          <span key={i} style={{ color: B.label, fontSize: '10px', letterSpacing: '0.5px' }}>▶ {r}</span>
                        ))}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => setTradeTarget(rec.ticker)}
                        style={{ padding: '3px 10px', background: B.green, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px' }}
                      >
                        BUY
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tradeTarget && (
        <TradeModal
          symbol={tradeTarget}
          currentPrice={0}
          maxSellQuantity={0}
          onClose={() => setTradeTarget(null)}
          onSuccess={() => setTradeTarget(null)}
        />
      )}
    </div>
  );
}
