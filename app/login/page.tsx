'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const B = {
  bg: '#000', panel: '#0d0d0d', border: '#2a2a2a',
  amber: '#ff8c00', green: '#00ff41', red: '#ff3333',
  label: '#888', text: '#e0e0e0',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', background: '#000',
  border: `1px solid #333`, color: B.text, fontFamily: 'Courier New, monospace',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  letterSpacing: '1px',
};
const btnStyle: React.CSSProperties = {
  width: '100%', padding: '12px', background: B.amber, color: '#000',
  border: 'none', cursor: 'pointer', fontFamily: 'Courier New, monospace',
  fontWeight: '900', fontSize: '13px', letterSpacing: '3px',
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'totp' | 'setup'>('password');
  const [password, setPassword] = useState('');
  const [passwordToken, setPasswordToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState('');
  const [totpSetupSecret, setTotpSetupSecret] = useState('');

  useEffect(() => {
    if (step === 'totp' || step === 'setup') {
      fetch('/api/auth/totp')
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            setQr(d.qr);
            if (d.isNew) {
              setTotpSetupSecret(d.secret);
              setStep('setup');
            }
          }
        });
    }
  }, [step]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordToken(data.token);
        setStep('totp');
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch { setError('Network error'); } finally { setLoading(false); }
  }

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, passwordToken }),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Invalid code');
        setCode('');
      }
    } catch { setError('Network error'); } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: B.bg, fontFamily: 'Courier New, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '380px', padding: '0 16px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-block', background: B.amber, color: '#000', fontWeight: '900', fontSize: '28px', letterSpacing: '4px', padding: '8px 20px' }}>
            TROVE
          </div>
          <div style={{ color: B.label, fontSize: '10px', letterSpacing: '3px', marginTop: '10px' }}>13F INSTITUTIONAL TRACKER</div>
        </div>

        <div style={{ background: B.panel, border: `1px solid ${B.border}` }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${B.border}`, color: B.amber, fontSize: '10px', letterSpacing: '3px', fontWeight: 'bold' }}>
            {step === 'password' ? 'AUTHENTICATE' : step === 'setup' ? 'SETUP 2FA' : 'VERIFY IDENTITY'}
          </div>

          <div style={{ padding: '24px 20px' }}>
            {/* STEP 1: Password */}
            {step === 'password' && (
              <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ color: B.label, fontSize: '9px', letterSpacing: '2px', marginBottom: '6px' }}>PASSWORD</div>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    style={inputStyle} autoFocus placeholder="Enter password"
                  />
                </div>
                {error && <div style={{ color: B.red, fontSize: '11px', letterSpacing: '1px' }}>{error}</div>}
                <button type="submit" disabled={loading || !password} style={{ ...btnStyle, opacity: loading || !password ? 0.5 : 1 }}>
                  {loading ? 'VERIFYING...' : 'CONTINUE →'}
                </button>
              </form>
            )}

            {/* STEP 1.5: First-time TOTP setup */}
            {step === 'setup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ color: B.text, fontSize: '12px', lineHeight: 1.7, margin: 0 }}>
                  First time setup. Scan this QR code with <strong style={{ color: B.amber }}>Google Authenticator</strong> or Authy.
                </p>
                {qr && (
                  <div style={{ background: '#fff', padding: '12px', display: 'inline-block', alignSelf: 'center' }}>
                    <img src={qr} alt="TOTP QR Code" style={{ width: 180, height: 180, display: 'block' }} />
                  </div>
                )}
                {totpSetupSecret && (
                  <div>
                    <div style={{ color: B.label, fontSize: '9px', letterSpacing: '2px', marginBottom: '4px' }}>MANUAL ENTRY KEY</div>
                    <div style={{ background: '#111', border: `1px solid ${B.border}`, padding: '8px 12px', color: B.cyan, fontSize: '12px', letterSpacing: '2px', wordBreak: 'break-all' }}>{totpSetupSecret}</div>
                  </div>
                )}
                <div style={{ background: '#1a0a00', border: `1px solid #4a2000`, padding: '10px 12px', color: '#ff9944', fontSize: '11px', lineHeight: 1.6 }}>
                  ⚠ Add <strong>TOTP_SECRET={totpSetupSecret}</strong> to your .env file, then restart the server before proceeding.
                </div>
                <button onClick={() => setStep('totp')} style={btnStyle}>I&apos;VE SCANNED IT →</button>
              </div>
            )}

            {/* STEP 2: TOTP code */}
            {step === 'totp' && (
              <form onSubmit={submitTotp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ color: B.label, fontSize: '11px', lineHeight: 1.7, margin: 0 }}>
                  Enter the 6-digit code from your authenticator app.
                </p>
                <div>
                  <div style={{ color: B.label, fontSize: '9px', letterSpacing: '2px', marginBottom: '6px' }}>AUTHENTICATOR CODE</div>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    style={{ ...inputStyle, fontSize: '24px', letterSpacing: '8px', textAlign: 'center' }}
                    autoFocus placeholder="000000"
                  />
                </div>
                {error && <div style={{ color: B.red, fontSize: '11px', letterSpacing: '1px' }}>{error}</div>}
                <button type="submit" disabled={loading || code.length !== 6} style={{ ...btnStyle, opacity: loading || code.length !== 6 ? 0.5 : 1 }}>
                  {loading ? 'VERIFYING...' : 'SIGN IN'}
                </button>
                <button type="button" onClick={() => { setStep('password'); setCode(''); setError(''); }}
                  style={{ background: 'none', border: 'none', color: B.label, cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', letterSpacing: '1px' }}>
                  ← BACK
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
