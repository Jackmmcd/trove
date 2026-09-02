'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import TickerPanel from './TickerPanel';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  tools?: { name: string; input: any }[];
  usage?: { cacheRead: number; cacheWrite: number; input: number; output: number };
}

const AMBER = '#ff8c00';
const DIM = '#666';

/**
 * Minimal inline renderer: **bold**, `code`, and $-prefixed figures.
 * Deliberately not a full markdown parser — Ed is instructed to write prose,
 * so this only needs to catch emphasis rather than render arbitrary documents.
 */
function renderInline(
  text: string,
  keyPrefix: string,
  known: Set<string>,
  onTicker: (t: string) => void,
) {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const plain = (chunk: string, k: string) => linkifyTickers(chunk, k, known, onTicker);
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(...plain(text.slice(last, m.index), `${keyPrefix}-p${i}`));
    if (m[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-b${i++}`} style={{ color: '#ffb454', fontWeight: 700 }}>{m[1]}</strong>);
    } else {
      parts.push(
        <code key={`${keyPrefix}-c${i++}`} style={{
          fontFamily: 'Courier New, monospace', fontSize: '0.9em', color: '#ffaa44',
        }}>{m[2]}</code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(...plain(text.slice(last), `${keyPrefix}-tail`));
  return parts;
}

/**
 * Turn every recognised symbol into a control that opens the side panel.
 *
 * Matching is gated on `known` — the set of tickers actually reported by a
 * tracked fund. A symbol Ed invented stays plain text, so the reader never gets
 * a clickable affordance implying a position exists.
 */
function linkifyTickers(
  text: string,
  keyPrefix: string,
  known: Set<string>,
  onTicker: (t: string) => void,
): React.ReactNode[] {
  if (!known.size) return [text];
  const out: React.ReactNode[] = [];
  const re = /[A-Z]{1,5}(?:\.[A-Z]{1,2})?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    const sym = m[0];
    if (!known.has(sym)) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <button
        key={`${keyPrefix}-t${i++}`}
        onClick={() => onTicker(sym)}
        title={`${sym} — open details`}
        style={{
          background: 'none', border: 'none', padding: 0,
          font: 'inherit', color: '#ffb454', cursor: 'pointer',
          borderBottom: '1px dotted #7a5a20',
        }}
      >
        {sym}
      </button>
    );
    last = m.index + sym.length;
  }
  if (!out.length) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Split into paragraphs and bullet lists; render each block with spacing. */
function RichText({ text, known, onTicker }: {
  text: string; known: Set<string>; onTicker: (t: string) => void;
}) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim());
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isList = lines.every(l => /^\s*[-•*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} style={{ margin: '0 0 14px', paddingLeft: '18px' }}>
              {lines.map((l, li) => (
                <li key={li} style={{ marginBottom: '5px' }}>
                  {renderInline(l.replace(/^\s*[-•*]\s+/, ''), `${bi}-${li}`, known, onTicker)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} style={{ margin: '0 0 14px' }}>
            {renderInline(block.replace(/^#{1,6}\s+/gm, ''), String(bi), known, onTicker)}
          </p>
        );
      })}
    </>
  );
}

const STARTERS = [
  'Which names are the most funds crowding into right now?',
  'What did the activists add last quarter?',
  'Where does my paper portfolio overlap with the funds I follow?',
  'Show me a name with strong consensus that I do not already own.',
];

export default function EdChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundCount, setFundCount] = useState<number | null>(null);
  const [knownTickers, setKnownTickers] = useState<Set<string>>(new Set());
  const [panelTicker, setPanelTicker] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Which symbols are real. Loaded once; without it nothing is clickable.
  useEffect(() => {
    fetch('/api/advisor/tickers')
      .then(r => r.ok ? r.json() : { tickers: [] })
      .then(d => setKnownTickers(new Set(d.tickers ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || busy) return;
    setError(null);
    setInput('');
    setMessages(m => [...m, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setBusy(true);

    try {
      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: convId }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
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
          const evLine = frame.split('\n').find(l => l.startsWith('event: '));
          const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
          if (!evLine || !dataLine) continue;
          const event = evLine.slice(7).trim();
          let data: any;
          try { data = JSON.parse(dataLine.slice(6)); } catch { continue; }

          // Must be a pure update. Mutating the existing message object here
          // (last.text += …) double-appends every chunk, because React invokes
          // state updaters twice under StrictMode and the second pass sees the
          // already-mutated object.
          setMessages(m => {
            const last = m[m.length - 1];
            if (!last || last.role !== 'assistant') return m;
            const updated: Msg =
              event === 'text'     ? { ...last, text: last.text + data.text }
            : event === 'thinking' ? { ...last, thinking: (last.thinking ?? '') + data.thinking }
            : event === 'tool'     ? { ...last, tools: [...(last.tools ?? []), data] }
            : event === 'done'     ? { ...last, usage: data }
            : last;
            if (updated === last) return m;
            return [...m.slice(0, -1), updated];
          });

          if (event === 'meta') { setConvId(data.conversationId); setFundCount(data.fundCount); }
          if (event === 'done') setConvId(data.conversationId);
          if (event === 'error') setError(data.message);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy, convId]);

  const empty = messages.length === 0;

  return (
    <div style={{
      maxWidth: '860px', margin: '0 auto', padding: '0 16px 140px',
      fontFamily: 'Courier New, monospace',
      transition: 'margin-right .15s ease',
    }}>

      <div style={{ padding: '28px 0 18px', borderBottom: `1px solid #1a1a1a` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ color: AMBER, fontSize: '22px', fontWeight: 900, letterSpacing: '3px', margin: 0 }}>ED</h1>
          <span style={{ color: DIM, fontSize: '11px', letterSpacing: '1px' }}>
            13F RESEARCH ASSISTANT{fundCount ? ` · ${fundCount} FUNDS IN CONTEXT` : ''}
          </span>
        </div>
        <p style={{ color: '#888', fontSize: '12.5px', lineHeight: 1.6, margin: '10px 0 0', maxWidth: '62ch' }}>
          Ed reads every tracked filer&apos;s disclosed positions. It surfaces what to look
          into and why — it does not give advice, and 13F data runs up to 45 days behind.
        </p>
      </div>

      {empty && (
        <div style={{ marginTop: '28px' }}>
          <div style={{ color: DIM, fontSize: '10.5px', letterSpacing: '1.5px', marginBottom: '10px' }}>TRY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {STARTERS.map(s => (
              <button key={s} onClick={() => send(s)} disabled={busy} style={{
                background: 'transparent', border: '1px solid #2a2a2a', color: '#bbb',
                fontFamily: 'inherit', fontSize: '13px', textAlign: 'left',
                padding: '11px 14px', cursor: busy ? 'default' : 'pointer', lineHeight: 1.45,
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', marginTop: '26px' }}>
        {messages.map((m, i) => (
          <div key={i}>
            <div style={{
              color: m.role === 'user' ? AMBER : DIM,
              fontSize: '10.5px', letterSpacing: '1.5px', marginBottom: '7px',
            }}>
              {m.role === 'user' ? 'YOU' : 'ED'}
            </div>

            <div style={{
              color: m.role === 'user' ? '#ddd' : '#e8e2d8',
              fontSize: '14.5px', lineHeight: 1.7,
              whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
              fontFamily: m.role === 'user' ? 'inherit' : 'Georgia, serif',
              maxWidth: '68ch',
            }}>
              {m.role === 'user'
                ? m.text
                : m.text
                  ? <RichText text={m.text} known={knownTickers} onTicker={setPanelTicker} />
                  : (busy && i === messages.length - 1
                      // Show the reasoning summary while it streams. Without this
                      // the user stares at a static word for the whole think phase,
                      // which is most of the wait on an analytical question.
                      ? <span style={{
                          color: '#6f6552', fontFamily: 'Courier New, monospace',
                          fontSize: '11.5px', lineHeight: 1.6, fontStyle: 'italic',
                          display: 'block', whiteSpace: 'pre-wrap',
                        }}>
                          {m.thinking ? m.thinking.slice(-400) : 'thinking…'}
                        </span>
                      : null)}
            </div>

            {m.usage && (
              <div style={{ color: '#3f3f3f', fontSize: '10px', letterSpacing: '.5px', marginTop: '9px' }}>
                cache read {m.usage.cacheRead.toLocaleString()} · write {m.usage.cacheWrite.toLocaleString()} ·
                {' '}in {m.usage.input.toLocaleString()} · out {m.usage.output.toLocaleString()}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <div style={{
          marginTop: '18px', border: '1px solid #3a1010', background: '#140606',
          color: '#e07a5a', fontSize: '12.5px', padding: '11px 14px', lineHeight: 1.55,
        }}>
          {error}
        </div>
      )}

      {panelTicker && (
        <TickerPanel ticker={panelTicker} onClose={() => setPanelTicker(null)} />
      )}

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#000', borderTop: '1px solid #1a1a1a', padding: '12px 16px',
      }}>
        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', gap: '9px', alignItems: 'flex-end' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={1}
            placeholder="Ask Ed about the funds…"
            disabled={busy}
            style={{
              flex: 1, background: '#0a0a0a', border: '1px solid #2a2a2a',
              color: '#e8e2d8', fontFamily: 'inherit', fontSize: '13.5px',
              padding: '10px 12px', outline: 'none', resize: 'none', lineHeight: 1.5,
              maxHeight: '140px',
            }}
          />
          <button type="submit" disabled={busy || !input.trim()} style={{
            background: busy || !input.trim() ? '#2a2a2a' : AMBER,
            color: busy || !input.trim() ? '#666' : '#000',
            border: 'none', fontFamily: 'inherit', fontWeight: 'bold',
            fontSize: '11px', letterSpacing: '1px', padding: '11px 18px',
            cursor: busy || !input.trim() ? 'default' : 'pointer',
          }}>
            {busy ? '···' : 'SEND'}
          </button>
        </form>
        <div style={{
          maxWidth: '860px', margin: '7px auto 0', color: '#333',
          fontSize: '9px', letterSpacing: '1px', textAlign: 'center',
        }}>
          NOT FINANCIAL ADVICE · ED CAN BE WRONG · VERIFY BEFORE ACTING ·{' '}
          <Link href="/terms" style={{ color: '#444' }}>TERMS</Link>
        </div>
      </div>
    </div>
  );
}
