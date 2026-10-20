'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/app/components/Navigation';
import useFundSearch from '@/app/components/useFundSearch';
import { FUNDS, type DirectoryFund } from '@/lib/funds/directory';

const B = {
  bg: 'var(--bg-000000)', panel: 'var(--bg-0d0d0d)', border: 'var(--bg-2a2a2a)',
  amber: 'var(--bg-ff8c00)', dim: 'var(--fg-666666)', text: 'var(--fg-e0e0e0)',
};

const TYPE_LABEL: Record<string, string> = {
  hedge_fund: 'HEDGE FUND', asset_manager: 'ASSET MANAGER', endowment: 'ENDOWMENT',
  sovereign_wealth: 'SOVEREIGN WEALTH', corporate: 'CORPORATE',
};

const EXAMPLES = ['Ray Dalio', 'quant funds', 'tiger cubs', 'activist', 'Buffett', 'Norway oil fund'];

const ALPHABETICAL = [...FUNDS].sort((a, b) => a.name.localeCompare(b.name));

/**
 * Every fund Trove tracks, searchable the way people describe them — by the
 * manager, a nickname, or a strategy — rather than by CIK or the EDGAR name.
 */
export default function FundDirectoryPage() {
  const [q, setQ] = useState('');
  const { instant, semantic, loading } = useFundSearch(q, 50);
  const results: DirectoryFund[] = useMemo(() => (q.trim() ? instant : ALPHABETICAL), [q, instant]);

  return (
    <div style={{ minHeight: '100vh', background: B.bg, color: B.text, fontFamily: 'Courier New, monospace' }}>
      <Navigation />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '22px 16px 60px' }}>
        <h1 style={{ color: B.amber, fontSize: '24px', fontWeight: 900, letterSpacing: '3px', margin: '0 0 4px' }}>FUND DIRECTORY</h1>
        <div style={{ color: 'var(--fg-444444)', fontSize: '10px', letterSpacing: '2px', marginBottom: '18px' }}>
          {FUNDS.length} 13F FILERS · OPEN ANY FUND FOR ITS FULL PORTFOLIO
        </div>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by fund, manager or strategy — e.g. “Ray Dalio’s fund”"
          autoFocus
          style={{
            width: '100%', background: 'var(--bg-0a0a0a)', border: `1px solid ${B.border}`,
            color: 'var(--fg-ffaa33)', fontFamily: 'Courier New, monospace', fontSize: '14px',
            padding: '12px 14px', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '10px 0 18px' }}>
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => setQ(ex)} style={{
              background: 'transparent', border: `1px solid ${B.border}`, color: B.dim,
              fontFamily: 'Courier New, monospace', fontSize: '11px', padding: '4px 10px', cursor: 'pointer',
            }}>
              {ex}
            </button>
          ))}
        </div>

        {results.length === 0 ? (
          !loading && semantic.length === 0 && (
            <div style={{ color: 'var(--fg-8a8070)', fontSize: '12.5px', padding: '20px 0' }}>
              No tracked fund matches “{q}”. Try a manager’s surname, a strategy like “macro”, or what a fund might own.
            </div>
          )
        ) : (
          <div style={{ border: `1px solid ${B.border}` }}>
            {results.map((f, i) => (
              <Link key={f.cik} href={`/fund/${f.cik}`} style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 14px',
                padding: '12px 16px', background: B.panel, textDecoration: 'none',
                borderTop: i ? '1px solid var(--bg-161616)' : 'none',
              }}>
                <span style={{ color: B.amber, fontWeight: 'bold', fontSize: '13.5px', letterSpacing: '0.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <span style={{ color: 'var(--fg-777777)', fontSize: '9.5px', letterSpacing: '1.5px', alignSelf: 'center' }}>
                  {TYPE_LABEL[f.entity_type] ?? f.entity_type}
                </span>
                <span style={{ color: B.dim, fontSize: '11px', gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.aliases.filter(a => a.toLowerCase() !== f.name.toLowerCase()).slice(0, 3).join(' · ')}
                  {f.tags.length > 0 && <span style={{ color: 'var(--fg-555555)' }}>{f.aliases.length ? ' — ' : ''}{f.tags.join(', ')}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}

        {q.trim() && (loading || semantic.length > 0) && (
          <div style={{ marginTop: '18px' }}>
            <div style={{ color: B.dim, fontSize: '9.5px', letterSpacing: '2px', marginBottom: '8px' }}>
              {loading && !semantic.length ? 'MATCHING AGAINST WHAT FUNDS HOLD…' : 'MATCHED BY WHAT THEY HOLD'}
            </div>
            {semantic.length > 0 && (
              <div style={{ border: `1px solid ${B.border}` }}>
                {semantic.map((f, i) => (
                  <Link key={f.cik} href={`/fund/${f.cik}`} style={{
                    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 14px',
                    padding: '12px 16px', background: B.panel, textDecoration: 'none',
                    borderTop: i ? '1px solid var(--bg-161616)' : 'none',
                  }}>
                    <span style={{ color: B.amber, fontWeight: 'bold', fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ color: 'var(--fg-777777)', fontSize: '9.5px', letterSpacing: '1.5px', alignSelf: 'center' }}>
                      {TYPE_LABEL[f.entity_type] ?? f.entity_type}
                    </span>
                    <span style={{ color: B.dim, fontSize: '11px', gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.why ? `Largest: ${f.why}` : `Profile match — holdings not loaded yet${f.tags.length ? ` · ${f.tags.join(', ')}` : ''}`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
