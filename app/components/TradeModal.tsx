'use client';

import { useState, useEffect } from 'react';

interface TradeModalProps {
  symbol: string;
  currentPrice: number;
  maxSellQuantity: number;
  initialTab?: 'buy' | 'sell';
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'buy' | 'sell';
type Step = 'input' | 'confirm';

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', amberDim: '#cc6d00', green: '#00ff41', red: '#ff3333',
  cyan: '#00e5ff', label: '#888', text: '#e0e0e0',
};

export default function TradeModal({ symbol, currentPrice, maxSellQuantity, initialTab = 'buy', onClose, onSuccess }: TradeModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [quantity, setQuantity] = useState<string>('1');
  const [step, setStep] = useState<Step>('input');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number>(currentPrice);
  const [loadingPrice, setLoadingPrice] = useState(currentPrice === 0);

  useEffect(() => {
    if (currentPrice > 0) { setLivePrice(currentPrice); return; }
    fetch(`/api/tastytrade/quotes?symbols=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.data[symbol]) setLivePrice(data.data[symbol]); })
      .catch(() => {})
      .finally(() => setLoadingPrice(false));
  }, [symbol]);

  const qty = parseFloat(quantity) || 0;
  const estimatedValue = qty * livePrice;

  function handleTabChange(newTab: Tab) {
    setTab(newTab); setQuantity('1'); setError(null); setStep('input');
  }

  function handlePreview() {
    if (qty <= 0) { setError('QUANTITY MUST BE GREATER THAN 0'); return; }
    if (tab === 'sell' && qty > maxSellQuantity) { setError(`MAX SELL: ${maxSellQuantity} SHARES`); return; }
    setError(null); setStep('confirm');
  }

  async function handleConfirm() {
    setSubmitting(true); setError(null);
    try {
      const response = await fetch('/api/tastytrade/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, quantity: qty, action: tab }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Order failed');
      setSuccessMsg(`ORDER SUBMITTED: ${tab.toUpperCase()} ${qty} ${symbol}`);
    } catch (err: any) {
      setError(err.message.toUpperCase());
      setStep('input');
    } finally {
      setSubmitting(false);
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  };
  const modalStyle: React.CSSProperties = {
    background: B.panel, border: `1px solid ${B.amber}`,
    width: '100%', maxWidth: '380px', margin: '0 16px',
    fontFamily: 'Courier New, monospace',
  };
  const headerStyle: React.CSSProperties = {
    background: B.amber, color: '#000', padding: '8px 16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', borderBottom: `1px solid #1a1a1a`, fontSize: '12px',
  };
  const inputStyle: React.CSSProperties = {
    background: '#000', border: `1px solid ${B.amber}`, color: B.amber,
    padding: '8px 12px', fontSize: '18px', fontFamily: 'Courier New, monospace',
    width: '100%', outline: 'none', letterSpacing: '1px',
  };
  const btnStyle = (color: string): React.CSSProperties => ({
    flex: 1, padding: '10px', background: color, color: '#000',
    border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace',
    fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px',
  });

  if (successMsg) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={headerStyle}>
            <span>ORDER CONFIRMED</span>
            <button onClick={() => { onSuccess(); onClose(); }} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ color: B.green, fontSize: '36px', marginBottom: '16px' }}>✓</div>
            <p style={{ color: B.green, fontSize: '13px', letterSpacing: '1px', marginBottom: '8px' }}>{successMsg}</p>
            <p style={{ color: B.label, fontSize: '11px', marginBottom: '24px' }}>MARKET ORDER SUBMITTED TO EXCHANGE</p>
            <button onClick={() => { onSuccess(); onClose(); }} style={btnStyle(B.amber)}>DONE</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <span>TRADE {symbol}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
        </div>

        {step === 'input' ? (
          <div style={{ padding: '16px' }}>
            {/* Buy/Sell toggle */}
            <div style={{ display: 'flex', marginBottom: '16px', border: `1px solid ${B.border}` }}>
              {(['buy', 'sell'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  style={{
                    flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
                    fontFamily: 'Courier New, monospace', fontWeight: 'bold',
                    fontSize: '12px', letterSpacing: '2px',
                    background: tab === t ? (t === 'buy' ? B.green : B.red) : '#111',
                    color: tab === t ? '#000' : B.label,
                  }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            <div style={rowStyle}>
              <span style={{ color: B.label, fontSize: '11px', letterSpacing: '1px' }}>MARKET PRICE</span>
              <span style={{ color: B.cyan, fontWeight: 'bold', fontSize: '14px' }}>
                {loadingPrice ? <span style={{ color: B.label, fontSize: '11px' }}>FETCHING...</span> : `$${livePrice.toFixed(2)}`}
              </span>
            </div>

            <div style={{ margin: '12px 0' }}>
              <div style={{ color: B.label, fontSize: '10px', letterSpacing: '1px', marginBottom: '6px' }}>
                SHARES {tab === 'sell' && <span style={{ color: B.amber }}>  (MAX: {maxSellQuantity})</span>}
              </div>
              <input
                type="number" min={0.0001} step="any" max={tab === 'sell' ? maxSellQuantity : undefined}
                value={quantity} onChange={e => setQuantity(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ ...rowStyle, background: '#0a0a00', padding: '8px 12px', borderBottom: 'none', marginBottom: '12px' }}>
              <span style={{ color: B.label, fontSize: '11px', letterSpacing: '1px' }}>EST. VALUE</span>
              <span style={{ color: B.amber, fontWeight: 'bold', fontSize: '14px' }}>
                ${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {error && <p style={{ color: B.red, fontSize: '11px', marginBottom: '8px', letterSpacing: '1px' }}>{error}</p>}

            <button onClick={handlePreview} style={btnStyle(B.amber)}>
              PREVIEW ORDER
            </button>
          </div>
        ) : (
          <div style={{ padding: '16px' }}>
            <div style={{ background: '#0a0a00', border: `1px solid ${B.amberDim}`, padding: '16px', marginBottom: '16px', textAlign: 'center' } as any}>
              <p style={{ color: B.label, fontSize: '10px', letterSpacing: '1px', marginBottom: '6px' }}>MARKET ORDER</p>
              <p style={{ color: tab === 'buy' ? B.green : B.red, fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '4px' }}>
                {tab.toUpperCase()} {qty} {symbol}
              </p>
              <p style={{ color: B.label, fontSize: '11px' }}>~${livePrice.toFixed(2)} / SHARE</p>
              <p style={{ color: B.amber, fontSize: '18px', fontWeight: 'bold', marginTop: '8px' }}>
                EST. ${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <p style={{ color: B.label, fontSize: '10px', letterSpacing: '0.5px', marginBottom: '4px', textAlign: 'center' }}>
              MARKET ORDERS EXECUTE AT BEST AVAILABLE PRICE
            </p>
            <p style={{ color: '#444', fontSize: '9px', letterSpacing: '0.5px', marginBottom: '12px', textAlign: 'center', lineHeight: 1.6 }}>
              ORDERS ARE ROUTED THROUGH YOUR CONNECTED BROKER. TROVE IS NOT A BROKER-DEALER.
              TRADING INVOLVES RISK OF LOSS. THIS IS NOT INVESTMENT ADVICE.
            </p>
            {error && <p style={{ color: B.red, fontSize: '11px', marginBottom: '8px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep('input')} disabled={submitting}
                style={{ ...btnStyle('#222'), color: B.label, flex: 1 }}>
                BACK
              </button>
              <button onClick={handleConfirm} disabled={submitting}
                style={btnStyle(tab === 'buy' ? B.green : B.red)}>
                {submitting ? 'SUBMITTING...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
