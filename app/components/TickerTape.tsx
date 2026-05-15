'use client';

import { useEffect, useState, useRef } from 'react';

interface TapeItem {
  symbol: string;
  price: number;
  gainLoss: number;
  gainLossPct: number;
}

export default function TickerTape() {
  const [items, setItems] = useState<TapeItem[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const posRes = await fetch('/api/tastytrade/positions');
        const posData = await posRes.json();
        if (!posData.success) return;

        const equities = posData.data.filter((p: any) => {
          const t = p['instrument-type'] || p.instrumentType || '';
          return t === 'Equity' || t === 'Stock';
        });
        if (equities.length === 0) return;

        const symbols = equities.map((p: any) => p.symbol).join(',');
        const qRes = await fetch(`/api/tastytrade/quotes?symbols=${encodeURIComponent(symbols)}`);
        const qData = await qRes.json();
        const prices: Record<string, number> = qData.success ? qData.data : {};
        const prevCloses: Record<string, number> = qData.prevCloses ?? {};

        const tape: TapeItem[] = equities.map((p: any) => {
          const price = prices[p.symbol] ?? parseFloat(p['close-price'] || p['mark-price'] || '0');
          const prevClose = prevCloses[p.symbol] ?? 0;
          const gainLoss = prevClose > 0 ? price - prevClose : 0;
          const gainLossPct = prevClose > 0 ? (gainLoss / prevClose) * 100 : 0;
          return { symbol: p.symbol, price, gainLoss, gainLossPct };
        });

        setItems(tape);
      } catch { /* ignore */ }
    }

    load();
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (items.length === 0) return null;

  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div style={{
      background: '#0a0a0a',
      borderBottom: '1px solid #ff8c00',
      height: '28px',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes tape-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .tape-track {
          display: flex;
          align-items: center;
          height: 100%;
          white-space: nowrap;
          animation: tape-scroll ${Math.max(items.length * 4, 30)}s linear infinite;
          width: max-content;
        }
        .tape-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="tape-track">
        {doubled.map((item, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 18px', fontFamily: 'Courier New, monospace', fontSize: '11px', borderRight: '1px solid #1a1a1a' }}>
            <span style={{ color: '#ff8c00', fontWeight: 'bold', letterSpacing: '1px' }}>{item.symbol}</span>
            <span style={{ color: '#e0e0e0' }}>${item.price.toFixed(2)}</span>
            <span style={{ color: item.gainLoss >= 0 ? '#00ff41' : '#ff3333', fontWeight: 'bold' }}>
              {item.gainLoss >= 0 ? '▲' : '▼'}{Math.abs(item.gainLossPct).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
