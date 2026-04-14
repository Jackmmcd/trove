'use client';

import { useState, useRef, useCallback } from 'react';

interface CompanyInfo {
  name: string;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
}

interface TickerTooltipProps {
  ticker: string;
  children: React.ReactNode;
}

const cache: Record<string, CompanyInfo | 'error'> = {};

export default function TickerTooltip({ ticker, children }: TickerTooltipProps) {
  const [info, setInfo] = useState<CompanyInfo | 'error' | null>(null);
  const [visible, setVisible] = useState(false);
  const fetchedRef = useRef(false);

  const handleMouseEnter = useCallback(async () => {
    setVisible(true);
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (cache[ticker]) { setInfo(cache[ticker]); return; }
    try {
      const res = await fetch(`/api/company-info?ticker=${encodeURIComponent(ticker)}`);
      const data = await res.json();
      const result = data.success ? data.data : 'error';
      cache[ticker] = result;
      setInfo(result);
    } catch {
      cache[ticker] = 'error';
      setInfo('error');
    }
  }, [ticker]);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && info && info !== 'error' && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', marginTop: '4px',
          zIndex: 100, width: '220px',
          background: '#000', border: '1px solid #ff8c00',
          padding: '10px 12px', pointerEvents: 'none',
          fontFamily: 'Courier New, monospace',
        }}>
          <p style={{ color: '#ff8c00', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', letterSpacing: '0.5px' }}>
            {info.name}
          </p>
          {info.sector && (
            <p style={{ color: '#888', fontSize: '11px', letterSpacing: '0.5px' }}>
              {info.sector}{info.industry ? ` · ${info.industry}` : ''}
            </p>
          )}
          {info.exchange && (
            <p style={{ color: '#555', fontSize: '10px', marginTop: '2px', letterSpacing: '1px' }}>
              {info.exchange}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
