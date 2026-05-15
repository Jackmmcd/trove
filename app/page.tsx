import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trove — Trade Like the Smart Money',
  description: 'Follow 13F institutional filings. Build baskets. Track performance. Connected directly to your brokerage.',
};

const B = {
  amber: '#ff8c00',
  amberDim: '#cc6d00',
  green: '#00ff41',
  cyan: '#00e5ff',
  border: '#2a2a2a',
  label: '#888',
  text: '#e0e0e0',
  panel: '#0d0d0d',
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 32px' }}>
      <div style={{ color: B.amber, fontSize: '36px', fontWeight: 900, letterSpacing: '2px', fontFamily: 'Courier New, monospace' }}>{value}</div>
      <div style={{ color: B.label, fontSize: '10px', letterSpacing: '3px', marginTop: '6px' }}>{label}</div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{
      background: B.panel,
      border: `1px solid ${B.border}`,
      borderTop: `3px solid ${B.amber}`,
      padding: '28px 24px',
      display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      <div style={{ fontSize: '28px' }}>{icon}</div>
      <div style={{ color: B.amber, fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px' }}>{title}</div>
      <div style={{ color: '#999', fontSize: '13px', lineHeight: 1.8 }}>{body}</div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      <div style={{
        minWidth: '40px', height: '40px',
        background: B.amber, color: '#000',
        fontWeight: 900, fontSize: '18px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Courier New, monospace',
        flexShrink: 0,
      }}>{n}</div>
      <div>
        <div style={{ color: B.text, fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '6px' }}>{title}</div>
        <div style={{ color: '#777', fontSize: '13px', lineHeight: 1.7 }}>{body}</div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: 'Courier New, monospace', color: B.text }}>

      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${B.amber}`, background: '#000' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ background: B.amber, color: '#000', fontWeight: 900, fontSize: '16px', letterSpacing: '3px', padding: '0 14px', height: '44px', display: 'flex', alignItems: 'center' }}>
            TROVE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px' }}>INSTITUTIONAL-GRADE · RETAIL-ACCESSIBLE</div>
            <Link href="/login" style={{
              background: B.amber, color: '#000',
              fontWeight: 900, fontSize: '11px', letterSpacing: '2px',
              padding: '0 16px', height: '28px', display: 'flex', alignItems: 'center',
              textDecoration: 'none',
            }}>
              LOGIN
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px 64px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          border: `1px solid ${B.amberDim}`,
          color: B.label, fontSize: '10px', letterSpacing: '3px',
          padding: '5px 16px', marginBottom: '32px',
        }}>
          INSTITUTIONAL-GRADE · RETAIL-ACCESSIBLE
        </div>
        <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '2px' }}>
          TRADE LIKE THE<br />
          <span style={{ color: B.amber }}>SMART MONEY</span>
        </h1>
        <p style={{ color: '#888', fontSize: '16px', lineHeight: 1.8, maxWidth: '600px', margin: '0 auto 32px' }}>
          Follow 13F filings. Build baskets. Rebalance automatically.<br />
          Connected directly to your brokerage.
        </p>
        <Link href="/login" style={{
          display: 'inline-block',
          background: B.amber, color: '#000',
          fontWeight: 900, fontSize: '13px', letterSpacing: '3px',
          padding: '14px 40px', textDecoration: 'none',
          marginBottom: '48px',
        }}>
          GET STARTED →
        </Link>

        {/* Stats bar */}
        <div style={{ display: 'flex', justifyContent: 'center', borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}`, padding: '32px 0', gap: '0', flexWrap: 'wrap' }}>
          <Stat value="13F" label="FILINGS TRACKED" />
          <div style={{ width: '1px', background: B.border, margin: '0 8px' }} />
          <Stat value="0%" label="MARKUP ON TRADES" />
          <div style={{ width: '1px', background: B.border, margin: '0 8px' }} />
          <Stat value="3" label="BROKERS SUPPORTED" />
          <div style={{ width: '1px', background: B.border, margin: '0 8px' }} />
          <Stat value="LIVE" label="PORTFOLIO TRACKING" />
        </div>
      </section>

      {/* What is Trove */}
      <section style={{ background: '#050505', borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '24px' }}>WHAT IS TROVE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: 900, lineHeight: 1.3, margin: '0 0 20px', letterSpacing: '1px' }}>
                Institutional investors file their holdings publicly.<br />
                <span style={{ color: B.amber }}>Most retail investors never look.</span>
              </h2>
              <p style={{ color: '#888', fontSize: '14px', lineHeight: 1.9, margin: 0 }}>
                Every quarter, funds managing over $100M must disclose their equity holdings to the SEC via Form 13F.
                Trove tracks these filings in real time, lets you browse fund portfolios, and connects directly to your
                brokerage so you can mirror positions with a single click.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                ['Bridgewater Associates', '$124B AUM', '+18.4% YTD'],
                ['Renaissance Technologies', '$60B AUM', '+31.2% YTD'],
                ['Soros Fund Management', '$25B AUM', '+22.7% YTD'],
              ].map(([name, aum, perf]) => (
                <div key={name} style={{ background: '#0d0d0d', border: `1px solid ${B.border}`, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: B.text, fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px' }}>{name}</div>
                    <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px', marginTop: '3px' }}>{aum}</div>
                  </div>
                  <div style={{ color: B.green, fontSize: '13px', fontWeight: 'bold' }}>{perf}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '32px' }}>PLATFORM FEATURES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          <Feature
            icon="📋"
            title="13F FILING TRACKER"
            body="Browse holdings from the world's top hedge funds and institutional investors. Updated quarterly directly from SEC EDGAR. Filter by fund, sector, or ticker."
          />
          <Feature
            icon="🧺"
            title="ONE-CLICK BASKETS"
            body="Select a fund and buy their entire portfolio as a basket trade. Set dollar amounts, confirm, and your brokerage executes all legs automatically."
          />
          <Feature
            icon="📊"
            title="LIVE PORTFOLIO DASHBOARD"
            body="Real-time position tracking with Day P&L, Week P&L, and total return. Synced directly with Tastytrade. Candlestick charts powered by Polygon.io."
          />
          <Feature
            icon="📰"
            title="MARKET INTELLIGENCE"
            body="AI-curated daily briefing tailored to your positions. Only articles relevant to your holdings — no noise. Powered by WSJ, Reuters, and Polygon news feeds."
          />
          <Feature
            icon="🎯"
            title="INSTITUTIONAL INSIGHTS"
            body="Ranked analysis of institutional activity derived from 13F position changes. See which funds are building or reducing positions across hundreds of filings."
          />
          <Feature
            icon="📈"
            title="STOCK ANALYSIS"
            body="Deep-dive stock pages with AI bull/bear case analysis, 52-week range, volume, and fundamental data. Search any ticker instantly from the nav bar."
          />
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: '#050505', borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '40px' }}>HOW IT WORKS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <Step n="1" title="CONNECT YOUR BROKERAGE" body="Link your Tastytrade account securely. Trove reads your positions and balance in real time. No credentials are stored — OAuth token only." />
              <Step n="2" title="BROWSE INSTITUTIONAL HOLDINGS" body="Explore 13F filings from hundreds of funds. See exactly what Bridgewater, Citadel, or Renaissance held last quarter." />
              <Step n="3" title="BUILD A BASKET OR FOLLOW A FUND" body="Select positions, set your dollar amount, and execute all legs as a single basket order through your connected brokerage." />
              <Step n="4" title="TRACK PERFORMANCE" body="Monitor your basket and individual positions in real time. Get daily briefings on news that actually affects your holdings." />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#0d0d0d', border: `1px solid ${B.border}` }}>
                <div style={{ padding: '8px 14px', borderBottom: `1px solid ${B.border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {['#ff5f56', '#ffbd2e', '#27c93f'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
                  <span style={{ color: B.label, fontSize: '10px', marginLeft: '8px', letterSpacing: '1px' }}>TROVE TERMINAL</span>
                </div>
                <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'FUND', value: 'Bridgewater Associates', color: B.amber },
                    { label: 'TOP HOLDING', value: 'SPDR S&P 500 ETF (SPY)', color: B.text },
                    { label: 'POSITION', value: '12,450,000 shares · $6.2B', color: B.text },
                    { label: 'CHANGE (QoQ)', value: '+4.2M shares', color: B.green },
                    { label: 'BASKET COST', value: '$1,000.00', color: B.cyan },
                    { label: 'POSITIONS', value: '23 stocks', color: B.text },
                    { label: 'STATUS', value: '✓ READY TO EXECUTE', color: B.green },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid #111`, paddingBottom: '8px' }}>
                      <span style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>{label}</span>
                      <span style={{ color, fontSize: '11px', fontWeight: 'bold' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brokers */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '32px' }}>SUPPORTED BROKERAGES</div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { name: 'TASTYTRADE', status: 'LIVE', desc: 'Full order execution, real-time quotes, position sync' },
            { name: 'SCHWAB', status: 'COMING SOON', desc: 'Charles Schwab Trader API integration — full trading, balances, and position sync' },
            { name: 'ALPACA', status: 'COMING SOON', desc: 'Paper trading and live execution via Alpaca API' },
          ].map(({ name, status, desc }) => (
            <div key={name} style={{ background: B.panel, border: `1px solid ${B.border}`, padding: '24px', flex: '1', minWidth: '260px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ color: B.text, fontWeight: 'bold', fontSize: '15px', letterSpacing: '2px' }}>{name}</div>
                <div style={{ color: status === 'LIVE' ? B.green : B.label, fontSize: '9px', letterSpacing: '2px', border: `1px solid ${status === 'LIVE' ? '#004400' : '#333'}`, padding: '2px 8px' }}>{status}</div>
              </div>
              <div style={{ color: '#666', fontSize: '12px', lineHeight: 1.7 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Data sources */}
      <section style={{ background: '#050505', borderTop: `1px solid ${B.border}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px' }}>POWERED BY</div>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {['POLYGON.IO', 'SEC EDGAR', 'TASTYTRADE API', 'WSJ', 'REUTERS'].map(s => (
              <span key={s} style={{ color: '#444', fontSize: '10px', letterSpacing: '2px' }}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${B.border}`, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: '#333', fontSize: '10px', letterSpacing: '2px', marginBottom: '12px' }}>
          © 2026 TROVE · NOT FINANCIAL ADVICE · FOR INFORMATIONAL PURPOSES ONLY
        </div>
        <div style={{ color: '#2a2a2a', fontSize: '9px', letterSpacing: '1px', lineHeight: 2, maxWidth: '800px', margin: '0 auto 12px' }}>
          TROVE IS AN INDEPENDENT THIRD-PARTY APPLICATION AND IS NOT AFFILIATED WITH, ENDORSED BY, OR SPONSORED BY ANY BROKERAGE FIRM INCLUDING CHARLES SCHWAB &amp; CO., INC., TASTYTRADE, OR ALPACA MARKETS.
          ALL ORDERS ARE ROUTED THROUGH YOUR CONNECTED BROKERAGE; TROVE IS NOT A REGISTERED BROKER-DEALER OR INVESTMENT ADVISER.
          13F FILING DATA IS SOURCED FROM SEC EDGAR AND MAY REFLECT HOLDINGS UP TO 45 DAYS AFTER QUARTER-END.
          AI-GENERATED ANALYSIS IS FOR INFORMATIONAL PURPOSES ONLY AND DOES NOT CONSTITUTE INVESTMENT ADVICE.
          INVESTING IN SECURITIES INVOLVES RISK, INCLUDING POSSIBLE LOSS OF PRINCIPAL.
          PAST PERFORMANCE OF ANY INVESTMENT STRATEGY DOES NOT GUARANTEE FUTURE RESULTS.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
          <a href="/terms" style={{ color: '#444', fontSize: '9px', letterSpacing: '2px', textDecoration: 'underline' }}>TERMS OF SERVICE</a>
          <a href="/privacy" style={{ color: '#444', fontSize: '9px', letterSpacing: '2px', textDecoration: 'underline' }}>PRIVACY POLICY</a>
          <a href="/disclosures" style={{ color: '#444', fontSize: '9px', letterSpacing: '2px', textDecoration: 'underline' }}>RISK DISCLOSURES</a>
        </div>
      </footer>

    </div>
  );
}
