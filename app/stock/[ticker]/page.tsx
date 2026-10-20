'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TradeModal from '@/app/components/TradeModal';
import useAccountSource from '@/app/components/useAccountSource';
import Navigation from '@/app/components/Navigation';
import AreaScrubChart from '@/app/components/AreaScrubChart';
import useIsMobile from '@/app/components/useIsMobile';

const B = {
  bg: 'var(--bg-000000)', panel: 'var(--bg-0d0d0d)', border: 'var(--bg-2a2a2a)',
  amber: 'var(--bg-ff8c00)', green: 'var(--bg-00ff41)', red: 'var(--bg-ff3333)', cyan: 'var(--bg-00e5ff)',
  label: 'var(--fg-888888)', text: 'var(--fg-e0e0e0)',
};

interface SparkPoint { t: number; v: number }
interface Candle { time: number | string; open: number; high: number; low: number; close: number }
interface StockData {
  ticker: string; name: string; exchange: string | null; currency: string;
  currentPrice: number | null; previousClose: number | null;
  open: number | null; dayLow: number | null; dayHigh: number | null;
  change: number | null; changePct: number | null;
  volume: number | null; avgVolume: number | null;
  change1d: number | null; change1m: number | null; change3m: number | null; ytdChange: number | null;
  sparkline: SparkPoint[];
  marketCap: number | null; enterpriseValue: number | null;
  peRatio: number | null; forwardPE: number | null;
  priceToBook: number | null; priceToSales: number | null;
  evToEbitda: number | null; evToRevenue: number | null;
  revenue: number | null; grossMargin: number | null;
  operatingMargin: number | null; profitMargin: number | null;
  returnOnEquity: number | null; returnOnAssets: number | null;
  debtToEquity: number | null; freeCashFlow: number | null; eps: number | null;
  week52High: number | null; week52Low: number | null;
  beta: number | null; dividendYield: number | null; payoutRatio: number | null;
  sector: string | null; industry: string | null;
  employees: number | null; website: string | null;
  description: string | null; country: string | null; city: string | null; state: string | null;
  candles: Candle[];
}

function fmt(n: number | null, decimals = 2, prefix = '') {
  if (n === null || n === undefined) return '—';
  return prefix + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtLarge(n: number | null) {
  if (n === null) return '—';
  if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString();
}
function fmtPct(n: number | null) {
  if (n === null) return '—';
  return (n * 100).toFixed(2) + '%';
}
function fmtVol(n: number | null) {
  if (n === null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}
function fmtChg(n: number | null) {
  if (n === null) return '—';
  const pct = (n * 100).toFixed(2);
  return (n >= 0 ? '+' : '') + pct + '%';
}

const RANGES = [
  { label: '1D', tv: '5', interval: '1d' },
  { label: '5D', tv: '30', interval: '5d' },
  { label: '1M', tv: 'D', interval: '1mo' },
  { label: '3M', tv: 'W', interval: '3mo' },
  { label: 'YTD', tv: 'W', interval: 'ytd' },
  { label: '1Y', tv: 'W', interval: '1y' },
  { label: '2Y', tv: 'M', interval: '2y' },
  { label: '5Y', tv: 'M', interval: '5y' },
];

const RANGE_LABEL: Record<string, string> = {
  '1D': 'Today', '5D': 'Past 5 days', '1M': 'Past month', '3M': 'Past 3 months',
  'YTD': 'Year to date', '1Y': 'Past year', '2Y': 'Past 2 years', '5Y': 'Past 5 years',
};
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Hover label for one candle. Intraday candles arrive as unix seconds and are
 * shown in market time; daily ones arrive as dates, with the year added once a
 * window spans more than one.
 */
function candleLabel(time: number | string, rangeLabel: string): string {
  if (typeof time === 'number') {
    const d = new Date(time * 1000);
    const clock = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    if (rangeLabel === '1D') return clock;
    const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).toUpperCase();
    return `${day} ${clock}`;
  }
  const [y, m, dd] = time.split('-');
  const base = `${MONTHS[Number(m) - 1]} ${Number(dd)}`;
  return ['2Y', '5Y'].includes(rangeLabel) ? `${base} ${y}` : base;
}

interface Analysis {
  summary: string;
  bullCase: string[];
  bearCase: string[];
}

function parseAnalysis(text: string): Analysis {
  const summary = text.match(/Summary:\s*([\s\S]*?)(?=Bull Case:|$)/i)?.[1]?.trim() ?? '';
  const bullRaw = text.match(/Bull Case:\s*([\s\S]*?)(?=Bear Case:|$)/i)?.[1] ?? '';
  const bearRaw = text.match(/Bear Case:\s*([\s\S]*?)$/i)?.[1] ?? '';
  const parsePoints = (s: string) => s.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  return { summary, bullCase: parsePoints(bullRaw), bearCase: parsePoints(bearRaw) };
}

export default function StockPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params?.ticker as string ?? '').toUpperCase();
  const isMobile = useIsMobile();
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(RANGES[0]); // 1D default
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<{ uuid: string; title: string; publisher: string; link: string; publishedAt: number }[]>([]);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [heldShares, setHeldShares] = useState<number>(0);
  const { isPaper } = useAccountSource();
  const [tradeModal, setTradeModal] = useState<'buy' | 'sell' | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(false);

  // Re-fetch candles whenever ticker or range changes
  useEffect(() => {
    if (!ticker) return;
    setCandlesLoading(true);
    setCandles([]);
    fetch(`/api/stock/${encodeURIComponent(ticker)}/candles?range=${range.interval}`)
      .then(r => r.json())
      .then(d => { if (d.success) setCandles(d.data); })
      .catch(() => {})
      .finally(() => setCandlesLoading(false));
  }, [ticker, range.interval]);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setAnalysis(null);
    setNewsItems([]);
    setDigest(null);
    fetch(`/api/stock/${ticker}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setData(d.data);
          if (d.data.description) {
            setAnalysisLoading(true);
            fetch('/api/stock/analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ description: d.data.description, ticker }),
            })
              .then(r => r.json())
              .then(a => { if (a.success) setAnalysis(parseAnalysis(a.analysis)); })
              .catch(() => {})
              .finally(() => setAnalysisLoading(false));
          }
        } else {
          setError(d.error || 'Failed to load');
        }
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));

    // Which positions to count depends on which account is actually theirs,
    // and only the server can say. This used to infer it from whether
    // /api/paper/balance returned ok, which it always does.
    fetch('/api/account/source')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.source === 'broker') {
          return fetch('/api/tastytrade/positions').then(r2 => r2.json()).then(pd => {
            if (pd.success) {
              const pos = pd.data.find((p: any) => p.symbol === ticker);
              setHeldShares(pos ? parseFloat(pos.quantity || '0') : 0);
            }
          });
        }
        return fetch('/api/paper/positions').then(r2 => r2.json()).then(pd => {
          if (pd.success) {
            const pos = pd.data.find((p: any) => p.symbol === ticker);
            setHeldShares(pos ? Number(pos.quantity || 0) : 0);
          }
        });
      })
      .catch(() => {});

    // Fetch news + digest in parallel, independent of stock data
    fetch(`/api/news/ticker?ticker=${ticker}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data.length > 0) {
          setNewsItems(d.data);
          setDigestLoading(true);
          const headlines = d.data.map((n: any) => n.title);
          fetch('/api/news/digest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headlines, ticker, mode: 'ticker' }),
          })
            .then(r => r.json())
            .then(a => { if (a.success) setDigest(a.digest); })
            .catch(() => {})
            .finally(() => setDigestLoading(false));
        }
      })
      .catch(() => {});
  }, [ticker]);

  const isUp = (data?.change ?? 0) >= 0;
  const priceColor = isUp ? B.green : B.red;

  // The chart plots closes for the selected range; its colour and the change
  // line above it describe that range, as on the portfolio page.
  const chartSeries = candles
    .filter(k => Number.isFinite(k.close) && k.close > 0)
    .map(k => ({ value: k.close, label: candleLabel(k.time, range.label) }));
  const windowChange = chartSeries.length > 1 ? chartSeries[chartSeries.length - 1].value - chartSeries[0].value : null;
  const windowPct = windowChange !== null ? (windowChange / chartSeries[0].value) * 100 : null;
  const windowUp = (windowChange ?? 0) >= 0;
  const windowTrend = windowUp ? B.green : B.red;
  const chartHeight = isMobile ? 220 : 300;

  function timeAgo(unix: number) {
    const diff = Math.floor(Date.now() / 1000) - unix;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  const Stat = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
    <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--bg-111111)' }}>
      <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px', marginBottom: '3px' }}>{label}</div>
      <div style={{ color: valueColor ?? B.text, fontSize: '13px' }}>{value}</div>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ background: B.panel, border: `1px solid ${B.border}` }}>
      <div style={{ padding: '7px 14px', borderBottom: `1px solid ${B.border}`, color: B.amber, fontSize: '11px', letterSpacing: '3px', fontWeight: 'bold' }}>{title}</div>
      {children}
    </div>
  );


  return (
    <div style={{ minHeight: '100vh', background: B.bg, fontFamily: 'Courier New, monospace', color: B.text }}>
      <Navigation />

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${B.border}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: `1px solid ${B.border}`, color: B.label, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit', fontSize: '12px', letterSpacing: '1px' }}>
          ← BACK
        </button>
        <span style={{ color: B.amber, fontWeight: 'bold', fontSize: '14px', letterSpacing: '3px' }}>{ticker}</span>
        {data && <span style={{ color: B.label, fontSize: '12px' }}>{data.name}</span>}
        {data?.sector && <span style={{ color: 'var(--fg-444444)', fontSize: '11px', letterSpacing: '1px' }}>{data.sector}</span>}

        {/* Trade buttons */}
        {data && (
          <div className="stock-trade-desktop" style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTradeModal('buy')}
              style={{ padding: '5px 18px', background: B.green, color: 'var(--fg-000000)', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px' }}
            >
              BUY
            </button>
            {heldShares > 0 && (
              <button
                onClick={() => setTradeModal('sell')}
                style={{ padding: '5px 18px', background: B.red, color: 'var(--fg-000000)', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px' }}
              >
                SELL
              </button>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', color: B.amber, letterSpacing: '2px' }}>
          LOADING {ticker}...
        </div>
      )}
      {error && (
        <div style={{ padding: '40px', textAlign: 'center', color: B.red, letterSpacing: '1px' }}>ERROR: {error}</div>
      )}

      {/* Mobile trade bar — BUY/SELL belong under the thumb, not in a top
          bar the user has scrolled a whole chart away from. */}
      {data && (
        <div className="stock-trade-bar">
          <button
            onClick={() => setTradeModal('buy')}
            style={{ flex: 1, padding: '13px', background: B.green, color: 'var(--fg-000000)', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }}
          >
            BUY {ticker}
          </button>
          {heldShares > 0 && (
            <button
              onClick={() => setTradeModal('sell')}
              style={{ flex: 1, padding: '13px', background: B.red, color: 'var(--fg-000000)', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }}
            >
              SELL
            </button>
          )}
        </div>
      )}

      {tradeModal && data && (
        <TradeModal
          symbol={ticker}
          currentPrice={data.currentPrice ?? 0}
          maxSellQuantity={heldShares}
          initialTab={tradeModal}
          isPaper={isPaper}
          onClose={() => setTradeModal(null)}
          onSuccess={() => {
            setTradeModal(null);
            const posUrl = isPaper ? '/api/paper/positions' : '/api/tastytrade/positions';
            fetch(posUrl).then(r => r.json()).then(d => {
              if (d.success) {
                const pos = d.data.find((p: any) => p.symbol === ticker);
                setHeldShares(pos ? parseFloat(pos.quantity || '0') : 0);
              }
            }).catch(() => {});
          }}
        />
      )}

      {data && (
        <div className="stock-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '1400px', margin: '0 auto' }}>

          {/* Price + performance row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 'clamp(30px, 9vw, 38px)', fontWeight: 'bold', color: B.text, letterSpacing: '1px', lineHeight: 1 }}>
                {data.currentPrice !== null ? `$${data.currentPrice.toFixed(2)}` : '—'}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px', alignItems: 'center' }}>
                {data.change !== null && (
                  <span style={{ fontSize: '14px', color: priceColor }}>
                    {isUp ? '+' : ''}{data.change.toFixed(2)} ({isUp ? '+' : ''}{((data.changePct ?? 0) * 100).toFixed(2)}%)
                  </span>
                )}
                <span style={{ color: 'var(--fg-444444)', fontSize: '11px', letterSpacing: '1px' }}>
                  {data.exchange} · {data.currency}
                </span>
              </div>
            </div>

            {/* Period performance pills */}
            <div className="r-hscroll" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {[
                { label: '1D', val: data.change1d },
                { label: '1M', val: data.change1m },
                { label: '3M', val: data.change3m },
                { label: 'YTD', val: data.ytdChange },
              ].map(p => {
                const up = (p.val ?? 0) >= 0;
                const color = p.val === null ? B.label : up ? B.green : B.red;
                return (
                  <div key={p.label} style={{ border: `1px solid var(--bg-222222)`, padding: '4px 10px', textAlign: 'center' }}>
                    <div style={{ color: B.label, fontSize: '9px', letterSpacing: '2px' }}>{p.label}</div>
                    <div style={{ color, fontSize: '12px', marginTop: '2px' }}>{fmtChg(p.val)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Price chart — the portfolio page's chart: trend-coloured line,
              no axes, glide-to-read, press-and-drag to measure. */}
          <div>
            {windowChange !== null && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: windowTrend, fontSize: '13px', fontWeight: 'bold' }}>
                  {windowUp ? '▲' : '▼'} ${Math.abs(windowChange).toFixed(2)} ({windowUp ? '+' : '−'}{Math.abs(windowPct ?? 0).toFixed(2)}%)
                </span>
                <span style={{ color: B.label, fontSize: '11px', letterSpacing: '0.5px' }}>{RANGE_LABEL[range.label]}</span>
              </div>
            )}

            {candlesLoading || chartSeries.length < 2 ? (
              <div style={{
                height: chartHeight, marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: candlesLoading ? 'var(--fg-ff8c00)' : B.label, fontSize: '12px', letterSpacing: '2px',
              }}>
                {candlesLoading ? 'LOADING CHART...' : 'NO PRICE DATA FOR THIS RANGE'}
              </div>
            ) : (
              <div style={{ marginTop: '10px' }}>
                <AreaScrubChart
                  key={range.label}
                  series={chartSeries}
                  height={chartHeight}
                  format={v => `$${v.toFixed(2)}`}
                />
              </div>
            )}

            <div className="r-hscroll" style={{ display: 'flex', gap: '6px', paddingTop: '10px' }}>
              {RANGES.map(r => {
                const on = range.label === r.label;
                return (
                  <button key={r.label} onClick={() => setRange(r)} style={{
                    background: on ? windowTrend : 'transparent',
                    color: on ? 'var(--bg-000000)' : B.label,
                    border: `1px solid ${on ? windowTrend : B.border}`,
                    padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '11px', letterSpacing: '1px', fontWeight: 'bold', flexShrink: 0,
                  }}>
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Analysis panel */}
          {(analysisLoading || analysis) && (
            <div style={{ background: B.panel, border: `1px solid ${B.border}` }}>
              <div style={{ padding: '7px 14px', borderBottom: `1px solid ${B.border}` }}>
                <span style={{ color: B.amber, fontSize: '11px', letterSpacing: '3px', fontWeight: 'bold' }}>ANALYSIS</span>
              </div>
              {analysisLoading ? (
                <div style={{ padding: '16px 20px', color: 'var(--fg-444444)', fontSize: '12px', letterSpacing: '2px' }}>ANALYZING...</div>
              ) : analysis && (
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px', marginBottom: '6px' }}>SUMMARY</div>
                    <p style={{ color: B.text, fontSize: '13px', lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
                  </div>
                  <div className="r-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <div style={{ color: B.green, fontSize: '10px', letterSpacing: '2px', marginBottom: '8px' }}>BULL CASE</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {analysis.bullCase.map((pt, i) => (
                          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <span style={{ color: B.green, fontSize: '11px', marginTop: '2px', flexShrink: 0 }}>▲</span>
                            <span style={{ color: 'var(--fg-cccccc)', fontSize: '12px', lineHeight: 1.6 }}>{pt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: B.red, fontSize: '10px', letterSpacing: '2px', marginBottom: '8px' }}>BEAR CASE</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {analysis.bearCase.map((pt, i) => (
                          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <span style={{ color: B.red, fontSize: '11px', marginTop: '2px', flexShrink: 0 }}>▼</span>
                            <span style={{ color: 'var(--fg-cccccc)', fontSize: '12px', lineHeight: 1.6 }}>{pt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Activity panel */}
          {(digestLoading || digest || newsItems.length > 0) && (
            <div style={{ background: B.panel, border: `1px solid ${B.border}` }}>
              <div style={{ padding: '7px 14px', borderBottom: `1px solid ${B.border}`, color: B.amber, fontSize: '11px', letterSpacing: '3px', fontWeight: 'bold' }}>
                RECENT ACTIVITY
              </div>
              <div className="r-grid-2 stock-activity" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                <div style={{ padding: '16px 18px', borderRight: `1px solid ${B.border}` }}>
                  <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px', marginBottom: '10px' }}>DIGEST</div>
                  {digestLoading ? (
                    <div style={{ color: 'var(--fg-444444)', fontSize: '12px', letterSpacing: '2px' }}>ANALYZING...</div>
                  ) : digest ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {digest.split('\n\n').filter(Boolean).map((para, i) => (
                        <p key={i} style={{ color: 'var(--fg-bbbbbb)', fontSize: '12px', lineHeight: 1.7, margin: 0 }}>{para}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px', marginBottom: '10px' }}>HEADLINES</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {newsItems.slice(0, 8).map(n => (
                      <a key={n.uuid} href={n.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 0', borderBottom: '1px solid var(--bg-111111)' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                          <span style={{ color: B.text, fontSize: '12px', lineHeight: 1.5 }}>{n.title}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ color: B.amber, fontSize: '10px', letterSpacing: '1px' }}>{n.publisher.toUpperCase()}</span>
                            <span style={{ color: 'var(--fg-444444)', fontSize: '10px' }}>{timeAgo(n.publishedAt)}</span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '8px' }}>

            <Section title="PRICE">
              <Stat label="OPEN" value={fmt(data.open, 2, '$')} />
              <Stat label="PREV CLOSE" value={fmt(data.previousClose, 2, '$')} />
              <Stat label="DAY LOW" value={fmt(data.dayLow, 2, '$')} />
              <Stat label="DAY HIGH" value={fmt(data.dayHigh, 2, '$')} />
              <Stat label="52W LOW" value={fmt(data.week52Low, 2, '$')} />
              <Stat label="52W HIGH" value={fmt(data.week52High, 2, '$')} />
            </Section>

            <Section title="VOLUME & SIZE">
              <Stat label="VOLUME" value={fmtVol(data.volume)} />
              <Stat label="AVG VOLUME" value={fmtVol(data.avgVolume)} />
              <Stat label="MARKET CAP" value={fmtLarge(data.marketCap)} />
              <Stat label="ENTERPRISE VALUE" value={fmtLarge(data.enterpriseValue)} />
              <Stat label="EMPLOYEES" value={data.employees ? data.employees.toLocaleString() : '—'} />
              <Stat label="BETA" value={fmt(data.beta)} />
            </Section>

            <Section title="VALUATION">
              <Stat label="P/E (TRAILING)" value={fmt(data.peRatio)} />
              <Stat label="P/E (FORWARD)" value={fmt(data.forwardPE)} />
              <Stat label="PRICE / BOOK" value={fmt(data.priceToBook)} />
              <Stat label="PRICE / SALES" value={fmt(data.priceToSales)} />
              <Stat label="EV / EBITDA" value={fmt(data.evToEbitda)} />
              <Stat label="EV / REVENUE" value={fmt(data.evToRevenue)} />
            </Section>

            <Section title="FINANCIALS">
              <Stat label="REVENUE (TTM)" value={fmtLarge(data.revenue)} />
              <Stat label="GROSS MARGIN" value={fmtPct(data.grossMargin)} valueColor={data.grossMargin !== null ? (data.grossMargin > 0.4 ? B.green : B.text) : undefined} />
              <Stat label="OPERATING MARGIN" value={fmtPct(data.operatingMargin)} valueColor={data.operatingMargin !== null ? (data.operatingMargin > 0.15 ? B.green : data.operatingMargin < 0 ? B.red : B.text) : undefined} />
              <Stat label="NET MARGIN" value={fmtPct(data.profitMargin)} valueColor={data.profitMargin !== null ? (data.profitMargin > 0.1 ? B.green : data.profitMargin < 0 ? B.red : B.text) : undefined} />
              <Stat label="FREE CASH FLOW" value={fmtLarge(data.freeCashFlow)} />
              <Stat label="EPS (TTM)" value={fmt(data.eps, 2, '$')} />
            </Section>

            <Section title="RETURNS & RISK">
              <Stat label="RETURN ON EQUITY" value={fmtPct(data.returnOnEquity)} />
              <Stat label="RETURN ON ASSETS" value={fmtPct(data.returnOnAssets)} />
              <Stat label="DEBT / EQUITY" value={fmt(data.debtToEquity)} />
              <Stat label="DIVIDEND YIELD" value={fmtPct(data.dividendYield)} />
              <Stat label="PAYOUT RATIO" value={fmtPct(data.payoutRatio)} />
              <Stat label="BETA" value={fmt(data.beta)} valueColor={data.beta !== null ? (data.beta > 1.5 ? B.red : data.beta < 0.5 ? B.cyan : B.text) : undefined} />
            </Section>

            <Section title="PROFILE">
              <Stat label="SECTOR" value={data.sector ?? '—'} />
              <Stat label="INDUSTRY" value={data.industry ?? '—'} />
              <Stat label="LOCATION" value={[data.city, data.state, data.country].filter(Boolean).join(', ') || '—'} />
              <Stat label="EXCHANGE" value={data.exchange ?? '—'} />
              {data.website && (
                <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--bg-111111)' }}>
                  <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px', marginBottom: '3px' }}>WEBSITE</div>
                  <a href={data.website} target="_blank" rel="noopener noreferrer" style={{ color: B.cyan, fontSize: '12px', textDecoration: 'none' }}>
                    {data.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
            </Section>

          </div>

          {/* Raw description (collapsed under About, shown only if no analysis) */}
          {data.description && !analysis && !analysisLoading && (
            <div style={{ background: B.panel, border: `1px solid ${B.border}` }}>
              <div style={{ padding: '7px 14px', borderBottom: `1px solid ${B.border}`, color: B.amber, fontSize: '11px', letterSpacing: '3px', fontWeight: 'bold' }}>
                ABOUT {data.ticker}
              </div>
              <div style={{ padding: '20px', color: 'var(--fg-aaaaaa)', fontSize: '13px', lineHeight: 2, letterSpacing: '0.3px' }}>
                {data.description}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
