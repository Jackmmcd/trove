'use client';

import { useState } from 'react';
import Link from 'next/link';
import AnalystFull from './AnalystFull';

const B = {
  amber: '#ff8c00',
  border: '#2a2a2a',
  label: '#888',
};

/**
 * Two-tab landing page: the marketing pitch, and the Analyst.
 *
 * The Analyst tab replaces the page rather than sitting inside it — a chat
 * squeezed into a marketing column reads as a widget, and a widget does not
 * invite the kind of question this thing is actually good at.
 *
 * Marketing content is passed in as children so it stays server-rendered; only
 * the tab switch is client-side.
 */
export default function LandingShell({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<'overview' | 'analyst'>('overview');

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? B.amber : 'transparent',
    color: active ? '#000' : B.amber,
    border: 'none',
    borderRight: `1px solid ${B.border}`,
    fontFamily: 'Courier New, monospace',
    fontWeight: 'bold',
    fontSize: '12px',
    letterSpacing: '1.5px',
    padding: '0 18px',
    height: '40px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav style={{
        background: '#000', borderBottom: `1px solid ${B.amber}`,
        position: 'sticky', top: 0, zIndex: 40, flexShrink: 0,
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', height: '40px' }}>
          <Link href="/" onClick={() => setTab('overview')} style={{
            background: B.amber, color: '#000', fontWeight: 900, fontSize: '16px',
            padding: '0 14px', height: '40px', display: 'flex', alignItems: 'center',
            marginRight: '16px', letterSpacing: '2px', textDecoration: 'none', flexShrink: 0,
            fontFamily: 'Courier New, monospace',
          }}>
            TROVE
          </Link>

          <button onClick={() => setTab('overview')} style={tabStyle(tab === 'overview')}>OVERVIEW</button>
          <button onClick={() => setTab('analyst')} style={tabStyle(tab === 'analyst')}>ANALYST</button>

          <Link href="/login" style={{
            marginLeft: 'auto', color: B.label, fontFamily: 'Courier New, monospace',
            fontSize: '11px', letterSpacing: '1.5px', textDecoration: 'none',
            border: `1px solid ${B.border}`, padding: '5px 14px',
          }}>
            LOGIN
          </Link>
        </div>
      </nav>

      {tab === 'overview'
        ? <div>{children}</div>
        : <AnalystFull />}
    </div>
  );
}
