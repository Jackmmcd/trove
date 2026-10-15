'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const AMBER = 'var(--bg-ff8c00)';
const DIM = 'var(--fg-666666)';

interface Result {
  query: string;
  title: string;
  insights: string[];
  symbols: { symbol: string; name: string | null; reason: string; held_by_funds: number }[];
}

const EXAMPLES = [
  'Trump and Xi agree on AI talks',
  'GLP-1 drugs reshaping food demand',
  'Power shortages for data centres',
];

/**
 * Theme search: describe an idea or paste a headline, get a quick read on what
 * it means and which held companies it touches. Symbols come from the tracked
 * funds' books only — see lib/ai-search.ts.
 */
export default function AISearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  async function run(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    const id = ++reqRef.current;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      if (id === reqRef.current) setResult(j);
    } catch (e) {
      if (id === reqRef.current) setError(e instanceof Error ? e.message : 'AI Search failed');
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }

  const canSubmit = !!query.trim() && !loading;

  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,.75)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '6vh 16px',
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-label="AI Search"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '860px', maxHeight: '88vh',
          background: 'var(--bg-0a0a0a)', border: `1px solid ${AMBER}`,
          display: 'flex', flexDirection: 'column',
          fontFamily: 'Courier New, monospace',
          animation: 'sheet-up .22s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--bg-1a1a1a)',
        }}>
          <span style={{ color: AMBER, fontWeight: 900, fontSize: '13px', letterSpacing: '2px' }}>AI SEARCH</span>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: '1px solid var(--bg-2a2a2a)', color: DIM,
            fontFamily: 'inherit', fontSize: '13px', lineHeight: 1, padding: '6px 10px', cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <p style={{
            margin: 0, color: 'var(--fg-aaaaaa)', fontSize: '12px', lineHeight: 1.6,
            border: '1px solid var(--bg-1f2a3a)', background: 'var(--bg-0b1118)', padding: '10px 12px',
          }}>
            Instead of looking up a ticker, describe what you&apos;re interested in — a market theme, a sector
            trend, an investment idea, or a headline. AI Search explains what it means and which companies
            held by the funds we track it touches.
          </p>

          <form onSubmit={e => { e.preventDefault(); run(query); }} style={{ display: 'flex' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Trump and Xi agree on AI talks"
              maxLength={300}
              enterKeyHint="search"
              style={{
                flex: 1, minWidth: 0, background: 'var(--bg-141414)', border: '1px solid var(--bg-2a2a2a)', borderRight: 'none',
                color: 'var(--fg-eeeeee)', fontFamily: 'inherit', fontSize: '14px', padding: '12px 14px', outline: 'none',
              }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear" style={{
                background: 'var(--bg-141414)', border: '1px solid var(--bg-2a2a2a)', borderLeft: 'none', borderRight: 'none',
                color: DIM, padding: '0 12px', cursor: 'pointer', fontSize: '14px',
              }}>✕</button>
            )}
            <button type="submit" disabled={!canSubmit} aria-label="Search" style={{
              background: canSubmit ? AMBER : 'var(--bg-222222)', color: canSubmit ? 'var(--fg-000000)' : DIM,
              border: 'none', fontFamily: 'inherit', fontWeight: 900, fontSize: '12px', letterSpacing: '1.5px',
              padding: '0 18px', cursor: canSubmit ? 'pointer' : 'default',
            }}>
              {loading ? '…' : 'GO'}
            </button>
          </form>

          {!result && !loading && !error && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => { setQuery(ex); run(ex); }} style={{
                  background: 'transparent', border: '1px solid var(--bg-2a2a2a)', color: 'var(--fg-999999)',
                  fontFamily: 'inherit', fontSize: '11px', padding: '6px 10px', cursor: 'pointer',
                }}>{ex}</button>
              ))}
            </div>
          )}

          {loading && <div style={{ color: DIM, fontSize: '12px', letterSpacing: '1px' }}>THINKING…</div>}
          {error && <div style={{ color: 'var(--fg-e07a5a)', fontSize: '12px', lineHeight: 1.6 }}>{error}</div>}

          {result && (
            <>
              <div>
                <div style={{ color: DIM, fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>QUICK INSIGHTS</div>
                <div style={{ background: 'var(--bg-121212)', border: '1px solid var(--bg-1f1f1f)', padding: '16px 18px' }}>
                  <div style={{ color: 'var(--fg-ffffff)', fontWeight: 900, fontSize: '17px', marginBottom: '12px' }}>{result.title}</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {result.insights.map((b, i) => (
                      <li key={i} style={{ color: 'var(--fg-cccccc)', fontSize: '13px', lineHeight: 1.5 }}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                {result.symbols.length ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-121212)' }}>
                        <th style={th}>SYMBOL</th>
                        <th style={th}>REASON</th>
                        <th style={{ ...th, textAlign: 'right' }}>FUNDS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.symbols.map(s => (
                        <tr key={s.symbol} style={{ borderBottom: '1px solid var(--bg-1a1a1a)' }}>
                          <td style={{ ...td, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                            <Link href={`/stock/${s.symbol}`} onClick={onClose} style={{ color: AMBER, fontWeight: 'bold', letterSpacing: '1px', textDecoration: 'none' }}>
                              {s.symbol}
                            </Link>
                            {s.name && <div style={{ color: DIM, fontSize: '10px', marginTop: '3px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>}
                          </td>
                          <td style={{ ...td, color: 'var(--fg-bbbbbb)', lineHeight: 1.5 }}>{s.reason}</td>
                          <td style={{ ...td, color: 'var(--fg-999999)', textAlign: 'right', verticalAlign: 'top' }}>{s.held_by_funds}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ color: DIM, fontSize: '12px', lineHeight: 1.6 }}>
                    No company the tracked funds hold has real exposure to this theme.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--bg-1a1a1a)', padding: '10px 16px', color: 'var(--fg-555555)', fontSize: '10px', lineHeight: 1.6 }}>
          Generated by AI for informational purposes only. Not a recommendation or investment advice, and may be
          incomplete or out of date. It does not consider your objectives or financial situation.{' '}
          <Link href="/disclosures" onClick={onClose} style={{ color: 'var(--fg-6a9fd8)' }}>Disclosures</Link>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', color: 'var(--fg-888888)', fontSize: '10px', letterSpacing: '1.5px', padding: '10px 12px', fontWeight: 'bold' };
const td: React.CSSProperties = { padding: '10px 12px' };
