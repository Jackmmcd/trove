'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const B = {
  amber: '#ff8c00',
  border: '#2a2a2a',
  label: '#888',
  panel: '#0d0d0d',
};

const STARTERS = [
  'Which names are the most funds crowding into?',
  'What did the activists add last quarter?',
  'Who owns SpaceX and Cerebras?',
  'Show me a high-conviction name under $10B.',
];

interface Turn { role: 'user' | 'assistant'; text: string }

/** Renders **bold** and hyphen bullets — the only markup the Analyst is told to emit. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim());
  const inline = (s: string, k: string) => {
    const out: React.ReactNode[] = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0, m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) out.push(s.slice(last, m.index));
      out.push(<strong key={`${k}-${i++}`} style={{ color: '#ffb454', fontWeight: 700 }}>{m[1]}</strong>);
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };

  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        if (lines.every(l => /^\s*[-•*]\s+/.test(l))) {
          return (
            <ul key={bi} style={{ margin: '0 0 14px', paddingLeft: '18px' }}>
              {lines.map((l, li) => (
                <li key={li} style={{ marginBottom: '6px' }}>{inline(l.replace(/^\s*[-•*]\s+/, ''), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={bi} style={{ margin: '0 0 14px' }}>{inline(block.replace(/^#{1,6}\s+/gm, ''), String(bi))}</p>;
      })}
    </>
  );
}

export default function AnalystFull() {
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/advisor/access').then(r => r.json())
      .then(d => setAccess(!!d.access)).catch(() => setAccess(false));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, thinking]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setGateError(null); setChecking(true);
    try {
      const res = await fetch('/api/advisor/access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not verify that address.');
      setAccess(true);
    } catch (err: any) { setGateError(err.message); }
    finally { setChecking(false); }
  }

  const ask = useCallback(async (text: string) => {
    if (!text.trim() || busy) return;
    setError(null); setInput(''); setThinking('');
    const history = turns.slice(-8);
    setTurns(t => [...t, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setBusy(true);
    try {
      const res = await fetch('/api/advisor/public-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
          else if (ev === 'thinking') setThinking(t => (t + d.thinking).slice(-320));
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
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); setThinking(''); inputRef.current?.focus(); }
  }, [busy, turns]);

  // Fills everything below the 40px tab bar.
  const shell: React.CSSProperties = {
    flex: 1, minHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column',
    background: '#000', fontFamily: 'Courier New, monospace',
  };

  if (access === null) {
    return <div style={{ ...shell, alignItems: 'center', justifyContent: 'center', color: B.label, fontSize: '12px' }}>loading…</div>;
  }

  if (!access) {
    return (
      <div style={{ ...shell, alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '460px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ color: B.amber, fontSize: '26px', fontWeight: 900, letterSpacing: '4px', margin: '0 0 14px' }}>
            THE ANALYST
          </h1>
          <p style={{ color: '#999', fontSize: '14px', lineHeight: 1.75, margin: '0 0 26px' }}>
            It reads every position these funds disclose to the SEC and tells you who is
            buying what, at what size, and how that has changed. Enter your email to try it.
          </p>
          <form onSubmit={submitEmail} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus
              style={{
                flex: '1 1 220px', background: '#0a0a0a', border: `1px solid ${B.border}`,
                borderBottom: `1px solid ${B.amber}`, color: B.amber,
                fontFamily: 'inherit', fontSize: '13px', padding: '11px 13px', outline: 'none',
              }}
            />
            <button type="submit" disabled={checking} style={{
              background: checking ? '#2a2a2a' : B.amber, color: checking ? '#666' : '#000',
              border: 'none', fontFamily: 'inherit', fontWeight: 900, fontSize: '12px',
              letterSpacing: '2px', padding: '11px 26px', cursor: checking ? 'default' : 'pointer',
            }}>{checking ? '···' : 'ENTER'}</button>
          </form>
          {gateError && <p style={{ color: '#e07a5a', fontSize: '12px', marginTop: '14px' }}>{gateError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 20px 24px' }}>
          {turns.length === 0 && (
            <div>
              <h1 style={{ color: B.amber, fontSize: '22px', fontWeight: 900, letterSpacing: '4px', margin: '0 0 8px' }}>
                THE ANALYST
              </h1>
              <p style={{ color: '#888', fontSize: '13px', lineHeight: 1.7, margin: '0 0 28px', maxWidth: '58ch' }}>
                Reading {fundCount ?? 26} institutional filers. Ask about a fund, a company,
                or what the smart money is crowding into.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {STARTERS.map(s => (
                  <button key={s} onClick={() => ask(s)} disabled={busy} style={{
                    background: 'transparent', border: `1px solid ${B.border}`, color: '#bbb',
                    fontFamily: 'inherit', fontSize: '13px', textAlign: 'left',
                    padding: '12px 15px', cursor: busy ? 'default' : 'pointer', lineHeight: 1.5,
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
            {turns.map((t, i) => (
              <div key={i}>
                <div style={{ color: t.role === 'user' ? B.amber : B.label, fontSize: '10px', letterSpacing: '2px', marginBottom: '8px' }}>
                  {t.role === 'user' ? 'YOU' : 'ANALYST'}
                </div>
                <div style={{
                  color: '#e8e2d8', fontSize: '14.5px', lineHeight: 1.72, maxWidth: '68ch',
                  fontFamily: t.role === 'user' ? 'inherit' : 'Georgia, serif',
                  whiteSpace: t.role === 'user' ? 'pre-wrap' : 'normal',
                }}>
                  {t.role === 'user'
                    ? t.text
                    : t.text
                      ? <Rich text={t.text} />
                      : (busy && i === turns.length - 1
                          ? <span style={{ color: '#6f6552', fontFamily: 'Courier New, monospace', fontSize: '11.5px', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                              {thinking || 'thinking…'}
                            </span>
                          : null)}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div style={{ marginTop: '20px', border: '1px solid #3a1010', background: '#140606', color: '#e07a5a', fontSize: '12.5px', padding: '11px 14px', lineHeight: 1.55 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${B.border}`, background: '#000', flexShrink: 0 }}>
        <form
          onSubmit={e => { e.preventDefault(); ask(input); }}
          style={{ maxWidth: '780px', margin: '0 auto', padding: '14px 20px', display: 'flex', gap: '9px' }}
        >
          <input
            ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            placeholder="Ask about a fund, a company, or who's buying what…"
            disabled={busy} autoFocus
            style={{
              flex: 1, background: '#0a0a0a', border: `1px solid ${B.border}`,
              color: '#e8e2d8', fontFamily: 'inherit', fontSize: '13.5px',
              padding: '11px 13px', outline: 'none',
            }}
          />
          <button type="submit" disabled={busy || !input.trim()} style={{
            background: busy || !input.trim() ? '#2a2a2a' : B.amber,
            color: busy || !input.trim() ? '#666' : '#000',
            border: 'none', fontFamily: 'inherit', fontWeight: 900,
            fontSize: '11px', letterSpacing: '2px', padding: '11px 22px',
            cursor: busy || !input.trim() ? 'default' : 'pointer',
          }}>{busy ? '···' : 'ASK'}</button>
        </form>
        <div style={{ maxWidth: '780px', margin: '0 auto', padding: '0 20px 12px', color: '#3a3a3a', fontSize: '9px', letterSpacing: '1.5px', textAlign: 'center' }}>
          NOT FINANCIAL ADVICE · 13F DATA REFLECTS A PRIOR QUARTER (45-DAY LAG) · THE ANALYST CAN BE WRONG
        </div>
      </div>
    </div>
  );
}
