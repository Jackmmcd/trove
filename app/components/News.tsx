'use client';

import { useEffect, useState } from 'react';

interface NewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  relatedTickers?: string[];
  source: 'yahoo' | 'wsj' | 'reuters';
}

const B = {
  panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', green: '#00ff41', red: '#ff3333',
  cyan: '#00e5ff', label: '#888', text: '#e0e0e0',
};

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(unix * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MACRO_KEYWORDS = ['federal reserve', 'fed ', 'inflation', 'gdp', 'economy', 'recession', 'interest rate', 's&p', 'dow jones', 'nasdaq', 'market', 'treasury', 'tariff'];

function isMacro(title: string): boolean {
  const lower = title.toLowerCase();
  return MACRO_KEYWORDS.some(k => lower.includes(k));
}

export default function News() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [ownedTickers, setOwnedTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'macro' | string>('all');

  useEffect(() => { fetchNews(); }, []);

  async function fetchNews() {
    setLoading(true);
    try {
      const res = await fetch('/api/news');
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
        setOwnedTickers(data.ownedTickers ?? []);
        // Fund tickers excluding owned ones
        setTickers((data.tickers ?? []).filter((t: string) => !(data.ownedTickers ?? []).includes(t)));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  const filtered = filter === 'all' ? items
    : filter === 'macro' ? items.filter(n => isMacro(n.title))
    : filter === 'wsj' ? items.filter(n => n.source === 'wsj')
    : filter === 'reuters' ? items.filter(n => n.source === 'reuters')
    : items.filter(n => (n.relatedTickers ?? []).includes(filter) || n.title.toUpperCase().includes(filter));

  const panelStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.border}` };
  const tagStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: '10px', letterSpacing: '1px',
    fontFamily: 'Courier New, monospace', cursor: 'pointer', border: 'none',
    background: active ? B.amber : '#111',
    color: active ? '#000' : B.label,
    fontWeight: active ? 'bold' : 'normal',
  });

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: B.amber, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>MARKET NEWS</div>
        <button onClick={fetchNews} style={{ padding: '5px 14px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' }}>
          REFRESH
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={tagStyle(filter === 'all')} onClick={() => setFilter('all')}>ALL</button>
        <button style={tagStyle(filter === 'macro')} onClick={() => setFilter('macro')}>MACRO</button>
        <button style={{ ...tagStyle(filter === 'wsj'), color: filter === 'wsj' ? '#000' : '#e0e0e0', background: filter === 'wsj' ? '#e0e0e0' : '#111', border: '1px solid #444' }} onClick={() => setFilter(prev => prev === 'wsj' ? 'all' : 'wsj')}>WSJ</button>
        <button style={{ ...tagStyle(filter === 'reuters'), color: filter === 'reuters' ? '#000' : '#ff8040', background: filter === 'reuters' ? '#ff8040' : '#111', border: '1px solid #4a2000' }} onClick={() => setFilter(prev => prev === 'reuters' ? 'all' : 'reuters')}>REUTERS</button>
        {ownedTickers.length > 0 && <span style={{ color: '#333', fontSize: '10px', margin: '0 4px' }}>|</span>}
        {ownedTickers.map(t => (
          <button key={t}
            style={{ ...tagStyle(filter === t), background: filter === t ? B.green : '#001a00', color: filter === t ? '#000' : B.green, border: `1px solid #004400` }}
            onClick={() => setFilter(prev => prev === t ? 'all' : t)}>
            {t}
          </button>
        ))}
        {tickers.length > 0 && <span style={{ color: '#333', fontSize: '10px', margin: '0 4px' }}>|</span>}
        {tickers.map(t => (
          <button key={t} style={tagStyle(filter === t)} onClick={() => setFilter(prev => prev === t ? 'all' : t)}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px', color: B.amber, letterSpacing: '2px', fontSize: '12px' }}>
          FETCHING NEWS FEED...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...panelStyle, padding: '32px', textAlign: 'center' }}>
          <p style={{ color: B.label, fontSize: '12px', letterSpacing: '1px' }}>NO ARTICLES — SYNC FUNDS FIRST</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '8px' }}>
          {filtered.map(item => {
            const macro = isMacro(item.title);
            const accentColor = item.source === 'wsj' ? '#e0e0e0'
              : item.source === 'reuters' ? '#ff8040'
              : macro ? B.cyan : B.amber;
            const sourceBadge = item.source === 'wsj' ? { bg: '#1a1a1a', color: '#e0e0e0', label: 'WSJ' }
              : item.source === 'reuters' ? { bg: '#2a1000', color: '#ff8040', label: 'REUTERS' }
              : null;
            return (
              <a key={item.uuid} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <div
                  style={{ ...panelStyle, padding: '12px 14px', cursor: 'pointer', borderLeft: `3px solid ${accentColor}`, display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1a1a00')}
                  onMouseLeave={e => (e.currentTarget.style.background = B.panel)}
                >
                  <div style={{ color: B.text, fontSize: '13px', lineHeight: '1.4', fontFamily: 'Courier New, monospace' }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {sourceBadge && (
                        <span style={{ fontSize: '9px', padding: '1px 6px', background: sourceBadge.bg, color: sourceBadge.color, letterSpacing: '1px', fontWeight: 'bold', border: `1px solid ${sourceBadge.color}33` }}>
                          {sourceBadge.label}
                        </span>
                      )}
                      <span style={{ color: accentColor, fontSize: '10px', letterSpacing: '1px' }}>
                        {item.publisher.toUpperCase()}
                      </span>
                    </div>
                    <span style={{ color: B.label, fontSize: '10px' }}>
                      {timeAgo(item.providerPublishTime)}
                    </span>
                  </div>
                  {item.relatedTickers && item.relatedTickers.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {item.relatedTickers.slice(0, 5).map(t => (
                        <span key={t} style={{ fontSize: '9px', padding: '1px 6px', background: '#1a1000', border: `1px solid #cc6d00`, color: B.amber, letterSpacing: '1px' }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
