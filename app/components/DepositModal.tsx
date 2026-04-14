'use client';

import { useState, useEffect } from 'react';

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', amberDim: '#cc6d00',
  green: '#00ff41', red: '#ff3333', cyan: '#00e5ff',
  label: '#888', text: '#e0e0e0',
};

interface AchRelationship {
  id: string;
  bankName: string;
  nameOnAccount: string;
  last4: string;
  status: string;
}

interface Transfer {
  id: string;
  direction: string;
  amount: number;
  status: string;
  createdAt: string;
  bankName: string;
}

interface DepositModalProps {
  onClose: () => void;
}

const QUICK_AMOUNTS = [500, 1000, 2500, 5000, 10000];

export default function DepositModal({ onClose }: DepositModalProps) {
  const [relationships, setRelationships] = useState<AchRelationship[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingRelationships, setLoadingRelationships] = useState(true);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [relError, setRelError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'Deposit' | 'Withdrawal'>('Deposit');

  const [step, setStep] = useState<'form' | 'confirm' | 'submitting' | 'done' | 'error'>('form');
  const [resultMsg, setResultMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('/api/tastytrade/ach-relationships')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setRelationships(d.data);
          if (d.data.length > 0) setSelectedId(d.data[0].id);
        } else {
          setRelError(d.error ?? 'Failed to load bank accounts');
        }
      })
      .catch(() => setRelError('Failed to load bank accounts'))
      .finally(() => setLoadingRelationships(false));

    fetch('/api/tastytrade/transfers')
      .then(r => r.json())
      .then(d => { if (d.success) setTransfers(d.data.slice(0, 10)); })
      .catch(() => {})
      .finally(() => setLoadingTransfers(false));
  }, []);

  async function submit() {
    setStep('submitting');
    try {
      const res = await fetch('/api/tastytrade/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ achRelationshipId: selectedId, amount, direction }),
      });
      const data = await res.json();
      if (data.success) {
        setResultMsg(`${direction} of $${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} submitted successfully.`);
        setStep('done');
      } else {
        setErrorMsg(data.error ?? 'Transfer failed');
        setStep('error');
      }
    } catch {
      setErrorMsg('Network error — please try again');
      setStep('error');
    }
  }

  const selectedBank = relationships.find(r => r.id === selectedId);
  const amountNum = parseFloat(amount) || 0;
  const canSubmit = selectedId && amountNum > 0;

  const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' };
  const modalStyle: React.CSSProperties = { background: B.panel, border: `1px solid ${B.amber}`, width: '100%', maxWidth: '560px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', fontFamily: 'Courier New, monospace', overflowY: 'auto' };
  const headerStyle: React.CSSProperties = { background: B.amber, color: '#000', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px', flexShrink: 0 };
  const sectionLabel: React.CSSProperties = { color: B.label, fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' };
  const inputStyle: React.CSSProperties = { background: '#000', border: `1px solid ${B.amber}`, color: B.amber, padding: '7px 12px', fontSize: '16px', fontFamily: 'Courier New, monospace', outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <span>FUND ACCOUNT</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '18px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>

        {/* Done state */}
        {step === 'done' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '16px' }}>
            <div style={{ color: B.green, fontSize: '40px' }}>✓</div>
            <p style={{ color: B.text, fontSize: '13px', letterSpacing: '1px', textAlign: 'center' }}>{resultMsg}</p>
            <p style={{ color: B.label, fontSize: '11px', textAlign: 'center' }}>ACH transfers typically settle in 1–3 business days.</p>
            <button onClick={onClose} style={{ padding: '8px 32px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px' }}>DONE</button>
          </div>
        )}

        {/* Error state */}
        {step === 'error' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '16px' }}>
            <div style={{ color: B.red, fontSize: '40px' }}>✗</div>
            <p style={{ color: B.red, fontSize: '13px', letterSpacing: '1px', textAlign: 'center' }}>{errorMsg}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep('form')} style={{ padding: '8px 20px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' }}>BACK</button>
              <button onClick={onClose} style={{ padding: '8px 20px', background: B.amber, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' }}>CLOSE</button>
            </div>
          </div>
        )}

        {/* Confirm state */}
        {step === 'confirm' && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ color: B.amber, fontSize: '12px', letterSpacing: '2px', borderBottom: `1px solid ${B.border}`, paddingBottom: '8px' }}>CONFIRM TRANSFER</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Type', value: direction.toUpperCase(), color: direction === 'Deposit' ? B.green : B.red },
                { label: 'Amount', value: `$${amountNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: B.cyan },
                { label: 'Bank', value: selectedBank ? `${selectedBank.bankName} ···${selectedBank.last4}` : '—', color: B.text },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid #111` }}>
                  <span style={{ color: B.label, fontSize: '11px', letterSpacing: '1px' }}>{row.label}</span>
                  <span style={{ color: row.color, fontWeight: 'bold', fontSize: '13px' }}>{row.value}</span>
                </div>
              ))}
            </div>
            <p style={{ color: B.label, fontSize: '10px', lineHeight: 1.6 }}>
              ACH transfers typically settle in 1–3 business days. Funds may be subject to a hold period.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('form')} style={{ padding: '7px 16px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' }}>BACK</button>
              <button onClick={submit} style={{ padding: '7px 24px', background: direction === 'Deposit' ? B.green : B.red, color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' }}>
                CONFIRM {direction.toUpperCase()}
              </button>
            </div>
          </div>
        )}

        {/* Submitting state */}
        {step === 'submitting' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
            <span style={{ color: B.amber, fontSize: '12px', letterSpacing: '2px' }}>SUBMITTING...</span>
          </div>
        )}

        {/* Main form */}
        {step === 'form' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Direction toggle */}
            <div>
              <div style={sectionLabel}>Transfer Type</div>
              <div style={{ display: 'flex', gap: '0' }}>
                {(['Deposit', 'Withdrawal'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    style={{ flex: 1, padding: '8px', background: direction === d ? (d === 'Deposit' ? B.green : B.red) : '#111', color: direction === d ? '#000' : B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px' }}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Bank account selector */}
            <div>
              <div style={sectionLabel}>Bank Account</div>
              {loadingRelationships ? (
                <span style={{ color: B.label, fontSize: '11px' }}>Loading bank accounts...</span>
              ) : relError ? (
                <div>
                  <span style={{ color: B.red, fontSize: '11px' }}>{relError}</span>
                  <p style={{ color: B.label, fontSize: '10px', marginTop: '6px', lineHeight: 1.5 }}>
                    No linked bank accounts found. Please add a bank account in your Tastytrade account settings first.
                  </p>
                </div>
              ) : relationships.length === 0 ? (
                <p style={{ color: B.label, fontSize: '11px', lineHeight: 1.5 }}>
                  No linked bank accounts found. Please link a bank account in Tastytrade first.
                </p>
              ) : (
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  style={{ ...inputStyle, fontSize: '13px', cursor: 'pointer' }}
                >
                  {relationships.map(r => (
                    <option key={r.id} value={r.id} disabled={r.status !== 'Approved'}>
                      {r.bankName} ···{r.last4}{r.nameOnAccount ? ` — ${r.nameOnAccount}` : ''}{r.status !== 'Approved' ? ` (${r.status})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Amount input */}
            <div>
              <div style={sectionLabel}>Amount (USD)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: B.label, fontSize: '16px' }}>$</span>
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
              {/* Quick amounts */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                {QUICK_AMOUNTS.map(a => (
                  <button
                    key={a}
                    onClick={() => setAmount(String(a))}
                    style={{ padding: '4px 10px', background: amount === String(a) ? B.amberDim : '#111', color: amount === String(a) ? '#000' : B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '10px', letterSpacing: '1px' }}
                  >
                    ${a.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent transfers */}
            {!loadingTransfers && transfers.length > 0 && (
              <div>
                <div style={sectionLabel}>Recent Transfers</div>
                <div style={{ border: `1px solid ${B.border}`, maxHeight: '140px', overflowY: 'auto' }}>
                  {transfers.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderBottom: `1px solid #111`, fontSize: '11px' }}>
                      <span style={{ color: t.direction === 'Deposit' ? B.green : B.red, minWidth: '80px' }}>{t.direction?.toUpperCase()}</span>
                      <span style={{ color: B.cyan, fontWeight: 'bold' }}>${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      <span style={{ color: B.label, fontSize: '10px' }}>{t.bankName}</span>
                      <span style={{ color: t.status === 'Complete' ? B.green : t.status === 'Failed' ? B.red : B.amber, fontSize: '10px', letterSpacing: '1px' }}>{t.status?.toUpperCase()}</span>
                      <span style={{ color: '#555', fontSize: '10px' }}>{t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: `1px solid ${B.border}` }}>
              <button onClick={onClose} style={{ padding: '7px 16px', background: 'transparent', color: B.label, border: `1px solid ${B.border}`, cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '11px', letterSpacing: '1px' }}>
                CANCEL
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={!canSubmit || relationships.length === 0}
                style={{ padding: '7px 24px', background: !canSubmit || relationships.length === 0 ? '#333' : B.amber, color: '#000', border: 'none', cursor: !canSubmit || relationships.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'Courier New, monospace', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px', opacity: !canSubmit || relationships.length === 0 ? 0.5 : 1 }}
              >
                REVIEW {direction.toUpperCase()}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
