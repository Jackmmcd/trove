'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import TickerPanel from './TickerPanel';
import { findTickerMatches } from '@/lib/analyst/tickers';
import { suggestFollowUps } from '@/lib/analyst/followups';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  tools?: { name: string; input: any }[];
  usage?: { cacheRead: number; cacheWrite: number; input: number; output: number };
}

interface ConvSummary { id: string; title: string; createdAt: string; updatedAt: string }

const AMBER = '#ff8c00';
const DIM = '#666';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Minimal inline renderer: **bold**, `code`, and $-prefixed figures.
 * Deliberately not a full markdown parser — Analyst is instructed to write prose,
 * so this only needs to catch emphasis rather than render arbitrary documents.
 */
function renderInline(
  text: string,
  keyPrefix: string,
  known: Set<string>,
  names: Record<string, string>,
  onTicker: (t: string) => void,
) {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const plain = (chunk: string, k: string) => linkifyTickers(chunk, k, known, names, onTicker);
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
 * Turn every recognised symbol into a link to its company page.
 *
 * Primary click opens /company/<T> in a new tab; alt-click peeks at the side
 * panel instead. Reading the full page is the more common intent, and a new tab
 * means following a symbol never costs the reader the conversation they were in
 * the middle of. The panel stays for what it was built for — checking one figure
 * mid-sentence — but it is now the deliberate gesture, and the tooltip says so.
 *
 * Matching is gated on `known` — the set of tickers actually reported by a
 * tracked fund. A symbol Analyst invented stays plain text, so the reader never gets
 * a clickable affordance implying a position exists.
 */
function linkifyTickers(
  text: string,
  keyPrefix: string,
  known: Set<string>,
  names: Record<string, string>,
  onTicker: (t: string) => void,
): React.ReactNode[] {
  const matches = findTickerMatches(text, known, names);
  if (!matches.length) return [text];
  const out: React.ReactNode[] = [];
  let last = 0;
  matches.forEach((mt, i) => {
    if (mt.start > last) out.push(text.slice(last, mt.start));
    out.push(
      <a
        key={`${keyPrefix}-t${i}`}
        href={`/company/${mt.symbol}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => { if (e.altKey) { e.preventDefault(); onTicker(mt.symbol); } }}
        title={`${mt.symbol} — open company page (alt-click to peek here)`}
        style={{
          font: 'inherit', color: '#ffb454', textDecoration: 'none',
          borderBottom: '1px dotted #7a5a20', cursor: 'pointer',
        }}
      >
        {mt.label}
      </a>
    );
    last = mt.end;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Split into paragraphs and bullet lists; render each block with spacing. */
function RichText({ text, known, names, onTicker }: {
  text: string; known: Set<string>; names: Record<string, string>; onTicker: (t: string) => void;
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
                  {renderInline(l.replace(/^\s*[-•*]\s+/, ''), `${bi}-${li}`, known, names, onTicker)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} style={{ margin: '0 0 14px' }}>
            {renderInline(block.replace(/^#{1,6}\s+/gm, ''), String(bi), known, names, onTicker)}
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

export default function AnalystChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundCount, setFundCount] = useState<number | null>(null);
  const [knownTickers, setKnownTickers] = useState<Set<string>>(new Set());
  const [tickerNames, setTickerNames] = useState<Record<string, string>>({});
  const [panelTicker, setPanelTicker] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Which symbols are real. Loaded once; without it nothing is clickable.
  useEffect(() => {
    fetch('/api/advisor/tickers')
      .then(r => r.ok ? r.json() : { tickers: [] })
      .then(d => { setKnownTickers(new Set(d.tickers ?? [])); setTickerNames(d.names ?? {}); })
      .catch(() => {});
  }, []);

  const loadConversations = useCallback(() => {
    fetch('/api/advisor/conversations')
      .then(r => r.ok ? r.json() : { conversations: [] })
      .then(d => setConversations(d.conversations ?? []))
      .catch(() => {});
  }, []);

  // Sidebar defaults open only where it does not steal reading width. Decided
  // after mount so the server and first client render agree.
  useEffect(() => {
    loadConversations();
    if (window.innerWidth >= 1100) setSidebarOpen(true);
  }, [loadConversations]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const openConversation = useCallback(async (id: string) => {
    if (busy) return;
    setLoadingConv(true); setError(null);
    try {
      const res = await fetch(`/api/advisor/conversations/${id}`);
      if (!res.ok) throw new Error('Could not open that conversation.');
      const d: { messages?: { role: 'user' | 'assistant'; text: string }[] } = await res.json();
      setMessages((d.messages ?? []).map(m => ({ role: m.role, text: m.text })));
      setConvId(id);
      if (window.innerWidth < 1100) setSidebarOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that conversation.');
    } finally {
      setLoadingConv(false);
    }
  }, [busy]);

  const newChat = useCallback(() => {
    if (busy) return;
    setMessages([]); setConvId(null); setError(null);
    if (window.innerWidth < 1100) setSidebarOpen(false);
    inputRef.current?.focus();
  }, [busy]);

  const deleteConversation = useCallback(async (id: string) => {
    setConversations(cs => cs.filter(c => c.id !== id));
    if (id === convId) { setMessages([]); setConvId(null); }
    await fetch(`/api/advisor/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
  }, [convId]);

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
      // The first turn of a new thread creates the row server-side, so the
      // sidebar only learns about it once the turn has finished.
      loadConversations();
    }
  }, [busy, convId, loadConversations]);

  const empty = messages.length === 0;
  const last = messages[messages.length - 1];

  // Chips hang off the newest assistant reply only, and never mid-stream —
  // suggestions derived from half a sentence point at the wrong things.
  const followUps = useMemo(
    () => (!busy && last?.role === 'assistant' && last.text
      ? suggestFollowUps(last.text, knownTickers)
      : []),
    [busy, last, knownTickers],
  );

  return (
    <>
      {sidebarOpen && (
        <>
          {/* Scrim and drawer both stop above the composer, so on a narrow
              screen the input stays reachable with history open. */}
          <div className="analyst-sidebar-scrim" onClick={() => setSidebarOpen(false)} />

          <aside className="analyst-sidebar">
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 14px 10px', borderBottom: '1px solid #1a1a1a',
            }}>
              <span style={{ color: DIM, fontSize: '10px', letterSpacing: '2px' }}>HISTORY</span>
              <button onClick={() => setSidebarOpen(false)} aria-label="Close history" style={{
                background: 'none', border: '1px solid #222', color: DIM,
                fontFamily: 'inherit', fontSize: '11px', lineHeight: 1,
                padding: '4px 8px', cursor: 'pointer',
              }}>✕</button>
            </div>

            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1a1a1a' }}>
              <button onClick={newChat} disabled={busy} style={{
                width: '100%', background: 'transparent', border: `1px solid ${AMBER}`,
                color: AMBER, fontFamily: 'inherit', fontSize: '10.5px', letterSpacing: '2px',
                padding: '9px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.4 : 1,
              }}>+ NEW CHAT</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {conversations.length === 0 && (
                <div style={{ color: '#444', fontSize: '11px', padding: '12px 14px', lineHeight: 1.6 }}>
                  No past conversations yet.
                </div>
              )}
              {conversations.map(c => {
                const active = c.id === convId;
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '6px',
                    padding: '9px 10px 9px 14px',
                    borderLeft: `2px solid ${active ? AMBER : 'transparent'}`,
                    background: active ? '#101010' : 'transparent',
                  }}>
                    <button
                      onClick={() => openConversation(c.id)}
                      disabled={busy || loadingConv}
                      title={c.title}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
                        border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{
                        color: active ? '#e8e2d8' : '#999', fontSize: '11.5px', lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{c.title}</div>
                      <div style={{ color: '#444', fontSize: '9.5px', marginTop: '3px', letterSpacing: '.5px' }}>
                        {timeAgo(c.updatedAt)}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteConversation(c.id)}
                      aria-label={`Delete ${c.title}`}
                      title="Delete"
                      style={{
                        background: 'none', border: 'none', color: '#3a3a3a',
                        fontFamily: 'inherit', fontSize: '11px', cursor: 'pointer', padding: '0 2px',
                      }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}

    <div className={sidebarOpen ? 'analyst-shifted' : undefined}>
    <div style={{
      maxWidth: '860px', margin: '0 auto', padding: '0 16px 140px',
      fontFamily: 'Courier New, monospace',
      transition: 'margin-right .15s ease',
    }}>

      <div style={{ padding: '28px 0 18px', borderBottom: `1px solid #1a1a1a` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{
            background: 'none', border: '1px solid #222', color: DIM,
            fontFamily: 'inherit', fontSize: '10px', letterSpacing: '1.5px',
            padding: '5px 9px', cursor: 'pointer',
          }}>{sidebarOpen ? '✕' : '☰'} HISTORY</button>
          <h1 style={{ color: AMBER, fontSize: '22px', fontWeight: 900, letterSpacing: '3px', margin: 0 }}>ANALYST</h1>
          <span style={{ color: DIM, fontSize: '11px', letterSpacing: '1px' }}>
            13F RESEARCH ASSISTANT{fundCount ? ` · ${fundCount} FUNDS IN CONTEXT` : ''}
          </span>
        </div>
        <p style={{ color: '#888', fontSize: '12.5px', lineHeight: 1.6, margin: '10px 0 0', maxWidth: '62ch' }}>
          Analyst reads every tracked filer&apos;s disclosed positions. It surfaces what to look
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
              {m.role === 'user' ? 'YOU' : 'ANALYST'}
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
                  ? <RichText text={m.text} known={knownTickers} names={tickerNames} onTicker={setPanelTicker} />
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

            {m.role === 'assistant' && i === messages.length - 1 && followUps.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '12px' }}>
                {followUps.map(q => (
                  <button key={q} onClick={() => send(q)} style={{
                    background: 'transparent', border: '1px solid #2a2a2a', color: '#9a9a9a',
                    fontFamily: 'Courier New, monospace', fontSize: '11.5px',
                    padding: '7px 11px', cursor: 'pointer', lineHeight: 1.4, textAlign: 'left',
                  }}>
                    {q}
                  </button>
                ))}
              </div>
            )}

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

      <div className={sidebarOpen ? 'analyst-shifted' : undefined} style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 85,
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
            placeholder="Ask Analyst about the funds…"
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
    </div>
    </>
  );
}
