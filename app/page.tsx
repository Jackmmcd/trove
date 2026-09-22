import Link from 'next/link';
import type { Metadata } from 'next';
import LandingShell from './components/LandingShell';
import { getUniverseStats, type UniverseFund } from '@/lib/landing/universe';

export const metadata: Metadata = {
  title: 'Trove — 13F holdings, read properly',
  description:
    'Every quarter, institutional filers disclose their US equity holdings. Trove reads those filings for a tracked set of funds, resolves them to companies, and lets you act on them through your own brokerage.',
};

// The universe changes when a fund files, not when someone loads the page.
export const revalidate = 3600;

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

function Feature({ tag, title, body }: { tag: string; title: string; body: string }) {
  return (
    <div style={{
      background: B.panel,
      border: `1px solid ${B.border}`,
      borderTop: `3px solid ${B.amber}`,
      padding: '24px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ color: B.amberDim, fontSize: '10px', letterSpacing: '2px' }}>{tag}</div>
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

/** One row of the tracked-universe table. */
function FundRow({ fund }: { fund: UniverseFund }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) 120px 72px 70px 64px',
      gap: '12px',
      alignItems: 'baseline',
      padding: '9px 0',
      borderBottom: '1px solid #141414',
    }}>
      <div style={{ color: B.text, fontSize: '12.5px', fontWeight: 'bold', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fund.name}</div>
      <div style={{ color: '#5a5a5a', fontSize: '9px', letterSpacing: '1.5px' }}>{fund.type}</div>
      <div style={{ color: B.cyan, fontSize: '10px', letterSpacing: '0.5px' }}>{fund.quarter}</div>
      <div style={{ color: '#888', fontSize: '11px', textAlign: 'right' }}>{fund.positions} pos</div>
      <div style={{ color: B.amber, fontSize: '11px', fontWeight: 'bold', textAlign: 'right' }}>{fund.value}</div>
    </div>
  );
}

export default async function LandingPage() {
  const u = await getUniverseStats();

  return (
    <LandingShell>
<div style={{ background: '#000', fontFamily: 'Courier New, monospace', color: B.text }}>

      {/* Hero */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          border: `1px solid ${B.amberDim}`,
          color: B.label, fontSize: '10px', letterSpacing: '3px',
          padding: '5px 16px', marginBottom: '28px',
        }}>
          {u ? `CURRENTLY TRACKING ${u.fundCount} INSTITUTIONAL FILERS` : 'SEC FORM 13F · INSTITUTIONAL HOLDINGS'}
        </div>
        <h1 style={{ margin: '0 0 20px', fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '1px' }}>
          {u ? <>{u.fundCount} FUNDS.<br /><span style={{ color: B.amber }}>{u.issuers} COMPANIES. ONE VIEW.</span></>
             : <>13F HOLDINGS,<br /><span style={{ color: B.amber }}>READ PROPERLY.</span></>}
        </h1>
        <p style={{ color: '#888', fontSize: '15px', lineHeight: 1.9, maxWidth: '660px', margin: '0 auto 32px' }}>
          Funds managing over $100M must disclose their US equity holdings to the SEC each quarter.
          Trove reads those filings for a fixed, named set of managers, resolves every position to a
          company, and shows where conviction overlaps across them{u ? ` — ${u.positions} positions as filed, currently.` : '.'}
        </p>
        <Link href="/login" style={{
          display: 'inline-block',
          background: B.amber, color: '#000',
          fontWeight: 900, fontSize: '13px', letterSpacing: '3px',
          padding: '14px 40px', textDecoration: 'none',
          marginBottom: '48px',
        }}>
          LOGIN →
        </Link>

        {/* Stats bar — every figure below is counted from the filings on record. */}
        <div className="landing-stats" style={{ display: 'flex', justifyContent: 'center', borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}`, padding: '32px 0', gap: '0', flexWrap: 'wrap' }}>
          <Stat value={u ? String(u.fundCount) : '13F'} label="FUNDS TRACKED" />
          <div style={{ width: '1px', background: B.border, margin: '0 8px' }} />
          <Stat value={u ? String(u.positions) : '—'} label="POSITIONS ON FILE" />
          <div style={{ width: '1px', background: B.border, margin: '0 8px' }} />
          <Stat value={u ? u.totalValue : '—'} label="DISCLOSED EQUITY VALUE" />
          <div style={{ width: '1px', background: B.border, margin: '0 8px' }} />
          <Stat value={u ? u.latestQuarter : '—'} label="MOST RECENT FILING" />
        </div>
      </section>

      {/* The tracked universe — the substance of the product, named in full. */}
      {u && (
        <section style={{ background: '#050505', borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}` }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
              <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold' }}>CURRENTLY TRACKING</div>
              <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px' }}>
                EACH FUND AT ITS OWN LATEST FILING · {u.totalValue} DISCLOSED
              </div>
            </div>
            <p style={{ color: '#777', fontSize: '13px', lineHeight: 1.9, maxWidth: '760px', margin: '0 0 28px' }}>
              Not &ldquo;hundreds of funds&rdquo;. These {u.fundCount}, in full, ordered by the size of the equity book they
              disclosed. Filers are not synchronised — one manager&rsquo;s latest filing can be a quarter older
              than another&rsquo;s, so each row states its own as-of quarter rather than a single date across the page.
            </p>
            <div className="landing-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
              <div>{u.funds.slice(0, Math.ceil(u.funds.length / 2)).map(f => <FundRow key={f.name} fund={f} />)}</div>
              <div>{u.funds.slice(Math.ceil(u.funds.length / 2)).map(f => <FundRow key={f.name} fund={f} />)}</div>
            </div>
          </div>
        </section>
      )}

      {/* What the filing is, and what it is not */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '28px' }}>WHAT THE DATA IS</div>
        <div className="landing-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'start' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.4, margin: '0 0 20px', letterSpacing: '1px' }}>
              A 13F is a good signal and a partial one.<br />
              <span style={{ color: B.amber }}>Both halves matter.</span>
            </h2>
            <p style={{ color: '#888', fontSize: '13.5px', lineHeight: 1.9, margin: '0 0 16px' }}>
              The filing is the output of research teams that cost tens of millions a year to run, published
              in full, for free, by law. Positions are reported as of quarter-end and disclosed up to 45 days
              later, so the data is a lens on conviction rather than a trade alert.
            </p>
            <p style={{ color: '#888', fontSize: '13.5px', lineHeight: 1.9, margin: 0 }}>
              It also covers long US-listed equity only. No shorts, no cash, no usable options exposure,
              nothing held offshore. A manager that looks concentrated in three names may be running a
              book you cannot see — Trove says so on the page rather than in the small print.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              ['SHOWN', B.green, 'Long US-listed equity positions, share counts and reported value, quarter-over-quarter changes, and the overlap between managers.'],
              ['NOT SHOWN', '#c44', 'Short positions, cash, derivatives exposure in any usable form, non-US listings, and anything traded after quarter-end.'],
              ['TIMING', B.cyan, 'Quarter-end holdings, disclosed up to 45 days later. Managers file on their own schedule; Trove never compares two funds across different quarters without saying so.'],
            ].map(([label, color, body]) => (
              <div key={label} style={{ background: '#050505', border: `1px solid ${B.border}`, borderLeft: `3px solid ${color}`, padding: '18px 22px' }}>
                <div style={{ color, fontSize: '10px', letterSpacing: '3px', marginBottom: '10px' }}>{label}</div>
                <div style={{ color: '#888', fontSize: '12.5px', lineHeight: 1.85 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How the data is actually assembled */}
      <section style={{ background: '#050505', borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '32px' }}>HOW IT IS BUILT</div>
          <div className="landing-features">
            <Feature
              tag="01"
              title="STRAIGHT FROM EDGAR"
              body="Filings are pulled from SEC EDGAR by CIK and parsed position by position. Large filers split a single quarter across several documents; those are merged, not counted twice."
            />
            <Feature
              tag="02"
              title="RESOLVED BY CUSIP, NOT TICKER"
              body="A filing reports a CUSIP. Tickers are a best-effort lookup that can differ between two funds holding the same company, so cross-fund overlap is keyed on the issuer — a company's stock and its bonds roll up to one name, and are labelled separately."
            />
            <Feature
              tag="03"
              title="THEMES BY WHAT A BUSINESS DOES"
              body="Filings record a ticker and a weight, never an industry. Company descriptions are embedded so a question like 'grid equipment' or 'GLP-1 exposure' is matched against what each company actually does, across every position on file."
            />
            <Feature
              tag="04"
              title="LIVE PRICES, CLEARLY SEPARATED"
              body="Intraday prices come from the broker feed and are labelled as live; when there is no print for a name, the last close is quoted with its date. A price from today is never blended into a sentence about a position from a filing."
            />
            <Feature
              tag="05"
              title="A STANDING CONTEXT, NOT A SEARCH"
              body="The whole universe is serialised once per sync and read verbatim on every question, so the analysis starts from every fund at once rather than from whichever rows a search happened to return."
            />
            <Feature
              tag="06"
              title="EXECUTION THROUGH YOUR OWN BROKER"
              body="Orders route through the brokerage account you connect. Trove holds no custody, takes no markup on trades, and is not a broker-dealer."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '40px' }}>HOW IT WORKS</div>
        <div className="landing-steps" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <Step n="1" title="CONNECT YOUR BROKERAGE" body="Link a Tastytrade account. Trove reads positions and balances in real time and stores no password — an OAuth token only, revocable from your broker." />
            <Step
              n="2"
              title="READ THE FILINGS"
              body={u
                ? `Browse all ${u.fundCount} tracked managers and the ${u.positions} positions they last disclosed — by fund, by company, or by which of them hold the same name.`
                : 'Browse every tracked manager and the positions they last disclosed — by fund, by company, or by which of them hold the same name.'}
            />
            <Step n="3" title="ASK THE ANALYST" body="Question the whole universe in plain English: who is crowding into a name, who just left it, what a theme actually looks like across these books, and where your own positions sit against them." />
            <Step n="4" title="BUILD A BASKET, THEN TRACK IT" body="Set a dollar amount, execute every leg as one basket through your broker, and follow it against the filings it came from." />
          </div>
          <div className="landing-terminal" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#0d0d0d', border: `1px solid ${B.border}` }}>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid ${B.border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
                {['#ff5f56', '#ffbd2e', '#27c93f'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
                <span style={{ color: B.label, fontSize: '10px', marginLeft: '8px', letterSpacing: '1px' }}>TROVE TERMINAL</span>
              </div>
              <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(u?.spotlight
                  ? [
                      { label: 'FUND', value: u.spotlight.fund, color: B.amber },
                      { label: 'AS OF', value: u.spotlight.quarter, color: B.cyan },
                      { label: 'POSITIONS', value: `${u.spotlight.positions} disclosed`, color: B.text },
                      { label: 'EQUITY VALUE', value: u.spotlight.value, color: B.text },
                      { label: 'LARGEST HOLDING', value: u.spotlight.topHolding, color: B.text },
                      { label: 'WEIGHT', value: u.spotlight.topWeight, color: B.text },
                      { label: 'TOP 10', value: u.spotlight.top10, color: B.green },
                    ]
                  : [{ label: 'STATUS', value: 'UNIVERSE LOADING', color: B.label }]
                ).map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottom: `1px solid #111`, paddingBottom: '8px' }}>
                    <span style={{ color: B.label, fontSize: '10px', letterSpacing: '1px' }}>{label}</span>
                    <span style={{ color, fontSize: '11px', fontWeight: 'bold', textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ color: '#444', fontSize: '10px', letterSpacing: '1px', lineHeight: 1.8 }}>
              LIVE FIGURES FROM THE TRACKED UNIVERSE, NOT AN ILLUSTRATION.
            </div>
          </div>
        </div>
      </section>

      {/* Brokers */}
      <section style={{ background: '#050505', borderTop: `1px solid ${B.border}`, maxWidth: '100%' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 24px' }}>
          <div style={{ color: B.amber, fontSize: '11px', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '32px' }}>SUPPORTED BROKERAGES</div>
          <div className="landing-brokers">
            {[
              { name: 'TASTYTRADE', status: 'LIVE', desc: 'Full order execution, live quotes, position sync' },
              { name: 'SCHWAB', status: 'COMING SOON', desc: 'Charles Schwab Trader API — trading, balances, and position sync' },
              { name: 'ALPACA', status: 'COMING SOON', desc: 'Paper and live execution via the Alpaca API' },
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
        </div>
      </section>

      {/* Data sources */}
      <section style={{ background: '#050505', borderTop: `1px solid ${B.border}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ color: B.label, fontSize: '10px', letterSpacing: '2px' }}>POWERED BY</div>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {['SEC EDGAR', 'POLYGON.IO', 'TASTYTRADE API', 'WSJ', 'REUTERS'].map(s => (
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
          TRACKED FUNDS ARE NAMED FOR IDENTIFICATION ONLY AND HAVE NO AFFILIATION WITH TROVE.
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
    </LandingShell>
  );
}
