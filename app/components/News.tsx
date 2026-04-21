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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const MACRO_KEYWORDS = ['federal reserve', 'fed ', 'inflation', 'gdp', 'economy', 'recession', 'interest rate', 's&p', 'dow jones', 'nasdaq', 'market', 'treasury', 'tariff'];
function isMacro(title: string) { return MACRO_KEYWORDS.some(k => title.toLowerCase().includes(k)); }

function ArticleCard({ item }: { item: NewsItem }) {
  const macro = isMacro(item.title);
  const accentColor = item.source === 'wsj' ? '#e0e0e0' : item.source === 'reuters' ? '#ff8040' : macro ? B.cyan : B.amber;
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
      <div
        style={{ background: B.panel, border: `1px solid ${B.border}`, borderLeft: `3px solid ${accentColor}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '5px', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1a1a00')}
        onMouseLeave={e => (e.currentTarget.style.background = B.panel)}
      >
        <div style={{ color: B.text, fontSize: '12px', lineHeight: 1.5, fontFamily: 'Courier New, monospace' }}>{item.title}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: accentColor, fontSize: '9px', letterSpacing: '1px' }}>{item.publisher.toUpperCase()}</span>
          <span style={{ color: B.label, fontSize: '9px' }}>{timeAgo(item.providerPublishTime)}</span>
        </div>
      </div>
    </a>
  );
}

export default function News() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [ownedTickers, setOwnedTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'macro' | string>('all');
  const [manualDigest, setManualDigest] = useState<string | null>(null);
  const [manualDigestLoading, setManualDigestLoading] = useState(false);

  // Daily briefing
  const [dailyDigest, setDailyDigest] = useState<string | null>(null);
  const [dailyLoading, setDailyLoading] = useState(true);

  useEffect(() => {
    fetchNews();
    fetch('/api/news/daily')
      .then(r => r.json())
      .then(d => { if (d.success) setDailyDigest(d.digest); })
      .catch(() => {})
      .finally(() => setDailyLoading(false));
  }, []);

  async function fetchNews() {
    setLoading(true);
    setManualDigest(null);
    try {
      const res = await fetch('/api/news');
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
        setOwnedTickers(data.ownedTickers ?? []);
        setTickers((data.tickers ?? []).filter((t: string) => !(data.ownedTickers ?? []).includes(t)));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function generateManualDigest() {
    const headlines = filtered.slice(0, 15).map(n => n.title);
    if (!headlines.length) return;
    setManualDigestLoading(true);
    setManualDigest(null);
    try {
      const res = await fetch('/api/news/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headlines, mode: 'market' }),
      });
      const data = await res.json();
      if (data.success) setManualDigest(data.digest);
    } catch { /* ignore */ } finally { setManualDigestLoading(false); }
  }

  const allTickers = [...new Set([...ownedTickers, ...tickers])];

  const filtered = filter === 'all' ? items
    : filter === 'macro' ? items.filter(n => isMacro(n.title))
    : items.filter(n => (n.relatedTickers ?? []).includes(filter) || n.title.toUpperCase().includes(filter));

  // Articles relevant to any followed/owned ticker, deduplicated
  const positionArticles: NewsItem[] = (() => {
    const tickerSet = new Set(allTickers.map(t => t.toUpperCase()));
    const seen = new Set<string>();
    return items.filter(n => {
      if (seen.has(n.uuid)) return false;
      const related = (n.relatedTickers ?? []).map((x: string) => x.toUpperCase());
      const titleUp = n.title.toUpperCase();
      const relevant = related.some(t => tickerSet.has(t)) || [...tickerSet].some(t => titleUp.includes(t));
      if (!relevant) return false;
      seen.add(n.uuid);
      return true;
    });
  })();

  const tagStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: '10px', letterSpacing: '1px',
    fontFamily: 'Courier New, monospace', cursor: 'pointer', border: 'none',
    background: active ? B.amber : '#111',
    color: active ? '#000' : B.label,
    fontWeight: active ? 'bold' : 'normal',
  });

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── DAILY BRIEFING HERO ── */}
      <div style={{ background: '#050505', border: `1px solid ${B.border}`, borderTop: `3px solid ${B.amber}` }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${B.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ color: B.amber, fontSize: '22px', fontWeight: 'bold', letterSpacing: '4px', lineHeight: 1 }}>DAILY BRIEFING</div>
            <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px', marginTop: '4px' }}>{today}</div>
          </div>
          <button
            onClick={() => {
              // Force regenerate by clearing cache then refetching
              fetch('/api/news/daily?force=1').then(r => r.json()).then(d => { if (d.success) setDailyDigest(d.digest); });
            }}
            style={{ background: 'none', border: `1px solid ${B.border}`, color: B.label, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '10px', letterSpacing: '1px', padding: '3px 10px' }}
          >
            REFRESH
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          {dailyLoading ? (
            <div style={{ color: '#333', fontSize: '14px', letterSpacing: '3px' }}>GENERATING BRIEFING...</div>
          ) : dailyDigest ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {dailyDigest.split('\n\n').filter(Boolean).map((para, i) => (
                <p key={i} style={{ color: i === 0 ? '#e8e8e8' : '#aaa', fontSize: i === 0 ? '16px' : '14px', lineHeight: 1.9, margin: 0, letterSpacing: '0.2px' }}>
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <div style={{ color: '#444', fontSize: '13px' }}>No briefing available — check back later.</div>
          )}
        </div>
      </div>

      {/* ── NEWS BY POSITION (flat deduplicated feed) ── */}
      {!loading && positionArticles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ color: B.amber, fontSize: '11px', fontWeight: 'bold', letterSpacing: '3px' }}>NEWS BY POSITION</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '8px' }}>
            {positionArticles.map(item => <ArticleCard key={item.uuid} item={item} />)}
          </div>
        </div>
      )}

      {/* ── ALL NEWS FEED ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: B.amber, fontSize: '11px', fontWeight: 'bold', letterSpacing: '3px' }}>ALL ARTICLES</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={generateManualDigest} disabled={manualDigestLoading || items.length === 0}
              style={{ padding: '4px 12px', background: 'transparent', color: B.cyan, border: `1px solid #004a5a`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px', opacity: manualDigestLoading || items.length === 0 ? 0.5 : 1 }}>
              {manualDigestLoading ? 'ANALYZING...' : 'DIGEST'}
            </button>
            <button onClick={fetchNews} style={{ padding: '4px 12px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px' }}>
              REFRESH
            </button>
          </div>
        </div>

        {/* Manual digest panel */}
        {manualDigest && (
          <div style={{ background: '#0a0a0a', border: `1px solid #004a5a` }}>
            <div style={{ padding: '7px 14px', borderBottom: '1px solid #004a5a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: B.cyan, fontSize: '10px', letterSpacing: '3px', fontWeight: 'bold' }}>MARKET DIGEST</span>
              <button onClick={() => setManualDigest(null)} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {manualDigest.split('\n\n').filter(Boolean).map((para, i) => (
                <p key={i} style={{ color: '#bbb', fontSize: '13px', lineHeight: 1.8, margin: 0 }}>{para}</p>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={tagStyle(filter === 'all')} onClick={() => setFilter('all')}>ALL</button>
          <button style={tagStyle(filter === 'macro')} onClick={() => setFilter('macro')}>MACRO</button>
          <button style={{ ...tagStyle(filter === 'wsj'), color: filter === 'wsj' ? '#000' : '#e0e0e0', background: filter === 'wsj' ? '#e0e0e0' : '#111', border: '1px solid #444' }} onClick={() => setFilter(p => p === 'wsj' ? 'all' : 'wsj')}>WSJ</button>
          <button style={{ ...tagStyle(filter === 'reuters'), color: filter === 'reuters' ? '#000' : '#ff8040', background: filter === 'reuters' ? '#ff8040' : '#111', border: '1px solid #4a2000' }} onClick={() => setFilter(p => p === 'reuters' ? 'all' : 'reuters')}>REUTERS</button>
          {ownedTickers.length > 0 && <span style={{ color: '#333', fontSize: '10px', margin: '0 4px' }}>|</span>}
          {ownedTickers.map(t => (
            <button key={t} style={{ ...tagStyle(filter === t), background: filter === t ? B.green : '#001a00', color: filter === t ? '#000' : B.green, border: `1px solid #004400` }} onClick={() => setFilter(p => p === t ? 'all' : t)}>{t}</button>
          ))}
          {tickers.length > 0 && <span style={{ color: '#333', fontSize: '10px', margin: '0 4px' }}>|</span>}
          {tickers.map(t => (
            <button key={t} style={tagStyle(filter === t)} onClick={() => setFilter(p => p === t ? 'all' : t)}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: B.amber, letterSpacing: '2px', fontSize: '12px' }}>FETCHING NEWS FEED...</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, padding: '32px', textAlign: 'center' }}>
            <p style={{ color: B.label, fontSize: '12px', letterSpacing: '1px' }}>NO ARTICLES — SYNC FUNDS FIRST</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '8px' }}>
            {filtered.map(item => <ArticleCard key={item.uuid} item={item} />)}
          </div>
        )}
      </div>

    </div>
  );
}
