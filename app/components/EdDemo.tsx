'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const B = {
  amber: '#ff8c00',
  amberDim: '#cc6d00',
  border: '#2a2a2a',
  label: '#888',
  panel: '#0d0d0d',
};

const STARTERS = [
  'Which names are the most funds crowding into?',
  'What did the activists add last quarter?',
  'Who owns SpaceX and Cerebras?',
];

interface Turn { role: 'user' | 'assistant'; text: string }

export default function EdDemo() {
  const [access, setAccess] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState('');
  const [fundCount, setFundCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/advisor/access')
      .then(r => r.json())
      .then(d => setAccess(!!d.access))
      .catch(() => setAccess(false));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns, thinking]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setGateError(null); setChecking(true);
    try {
      const res = await fetch('/api/advisor/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not verify that address.');
      setAccess(true);
    } catch (err: any) {
      setGateError(err.message);
    } finally {
      setChecking(false);
    }
  }

  const ask = useCallback(async (text: string) => {
    if (!text.trim() || busy) return;
    setError(null); setInput(''); setThinking('');
    const history = turns.slice(-8);
    setTurns(t => [...t, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setBusy(true);

    try {
      const res = await fetch('/api/advisor/public-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const ev = frame.split('\n').find(l => l.startsWith('event: '))?.slice(7).trim();
          const dl = frame.split('\n').find(l => l.startsWith('data: '))?.slice(6);
          if (!ev || !dl) continue;
          let d: any;
          try { d = JSON.parse(dl); } catch { continue; }

          if (ev === 'meta') setFundCount(d.fundCount);
          else if (ev === 'thinking') setThinking(t => (t + d.thinking).slice(-300));
          else if (ev === 'error') setError(d.message);
          else if (ev === 'text') {
            setTurns(t => {
              const last = t[t.length - 1];
              if (!last || last.role !== 'assistant') return t;
              return [...t.slice(0, -1), { ...last, text: last.text + d.text }];
            });
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false); setThinking('');
    }
  }, [busy, turns]);

  const frame = {
    background: B.panel,
    border: `1px solid ${B.border}`,
    borderTop: `2px solid ${B.amber}`,
    textAlign: 'left' as const,
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: B.amber, fontWeight: 900, fontSize: '15px', letterSpacing: '3px' }}>ASK ED</span>
        <span style={{ color: B.label, fontSize: '10px', letterSpacing: '2px' }}>
          13F RESEARCH ASSISTANT{fundCount ? ` · ${fundCount} FUNDS` : ''}
        </span>
      </div>

      {access === null && (
        <div style={{ ...frame, padding: '28px', color: B.label, fontSize: '12px', textAlign: 'center' }}>
          loading…
        </div>
      )}

      {access === false && (
        <div style={{ ...frame, padding: '28px 24px' }}>
          <p style={{ color: '#bbb', fontSize: '14px', lineHeight: 1.7, margin: '0 0 18px', textAlign: 'center' }}>
            Ed reads every position these funds disclose and tells you who is buying what.
            Enter your email to try it.
          </p>
          <form onSubmit={submitEmail} style={{ display: 'flex', gap: '8px', maxWidth: '440px', margin: '0 auto', flexWrap: 'wrap' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                flex: '1 1 220px', background: '#000', border: `1px solid ${B.border}`,
                borderBottom: `1px solid ${B.amber}`, color: B.amber,
                fontFamily: 'Courier New, monospace', fontSize: '13px',
                padding: '10px 12px', outline: 'none',
              }}
            />
            <button type="submit" disabled={checking} style={{
              background: checking ? '#2a2a2a' : B.amber, color: checking ? '#666' : '#000',
              border: 'none', fontFamily: 'Courier New, monospace', fontWeight: 900,
              fontSize: '12px', letterSpacing: '2px', padding: '10px 22px',
              cursor: checking ? 'default' : 'pointer',
            }}>
              {checking ? '···' : 'ENTER'}
            </button>
          </form>
          {gateError && (
            <p style={{ color: '#e07a5a', fontSize: '12px', textAlign: 'center', margin: '14px 0 0' }}>{gateError}</p>
          )}
        </div>
      )}

      {access && (
        <div style={frame}>
          <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '20px 22px' }}>
            {turns.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {STARTERS.map(s => (
                  <button key={s} onClick={() => ask(s)} disabled={busy} style={{
                    background: 'transparent', border: `1px solid ${B.border}`, color: '#bbb',
                    fontFamily: 'Courier New, monospace', fontSize: '12.5px', textAlign: 'left',
                    padding: '10px 13px', cursor: busy ? 'default' : 'pointer', lineHeight: 1.5,
                  }}>{s}</button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {turns.map((t, i) => (
                <div key={i}>
                  <div style={{ color: t.role === 'user' ? B.amber : B.label, fontSize: '9.5px', letterSpacing: '2px', marginBottom: '6px' }}>
                    {t.role === 'user' ? 'YOU' : 'ED'}
                  </div>
                  <div style={{
                    color: '#ddd', fontSize: '13.5px', lineHeight: 1.7,
                    fontFamily: t.role === 'user' ? 'Courier New, monospace' : 'Georgia, serif',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {t.text.replace(/\*\*(.+?)\*\*/g, '$1') ||
                      (busy && i === turns.length - 1
                        ? <span style={{ color: '#6f6552', fontFamily: 'Courier New, monospace', fontSize: '11px', fontStyle: 'italic' }}>
                            {thinking || 'thinking…'}
                          </span>
                        : null)}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {error && <div style={{ color: '#e07a5a', fontSize: '12px', marginTop: '14px' }}>{error}</div>}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); ask(input); }}
            style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${B.border}`, padding: '12px 14px' }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about a fund, a company, or who's buying what…"
              disabled={busy}
              style={{
                flex: 1, background: '#000', border: `1px solid ${B.border}`,
                color: '#e8e2d8', fontFamily: 'Courier New, monospace',
                fontSize: '13px', padding: '9px 11px', outline: 'none',
              }}
            />
            <button type="submit" disabled={busy || !input.trim()} style={{
              background: busy || !input.trim() ? '#2a2a2a' : B.amber,
              color: busy || !input.trim() ? '#666' : '#000',
              border: 'none', fontFamily: 'Courier New, monospace', fontWeight: 900,
              fontSize: '11px', letterSpacing: '2px', padding: '9px 18px',
              cursor: busy || !input.trim() ? 'default' : 'pointer',
            }}>
              {busy ? '···' : 'ASK'}
            </button>
          </form>
        </div>
      )}

      <p style={{ color: '#444', fontSize: '9px', letterSpacing: '1.5px', textAlign: 'center', marginTop: '10px' }}>
        NOT FINANCIAL ADVICE · 13F DATA REFLECTS A PRIOR QUARTER (45-DAY LAG) · ED CAN BE WRONG
      </p>
    </div>
  );
}
