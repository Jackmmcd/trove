'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const errorParam = searchParams.get('error');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard');
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      router.replace('/dashboard');
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      });
      if (error) { setError(error.message); setLoading(false); return; }
      setError('Check your email to confirm your account.');
      setLoading(false);
    }
  }

  const B = {
    amber: '#ff8c00',
    bg: '#000',
    surface: '#0d0d0d',
    border: '#1a1a1a',
    text: '#ccc',
    dim: '#666',
    red: '#ff3333',
  };

  return (
    <div style={{ minHeight: '100vh', background: B.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '360px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-block', background: B.amber, color: '#000',
            fontWeight: '900', fontSize: '28px', letterSpacing: '4px',
            padding: '8px 24px', fontFamily: 'Courier New, monospace',
          }}>
            TROVE
          </div>
          <div style={{ color: B.dim, fontSize: '10px', letterSpacing: '2px', marginTop: '8px', fontFamily: 'Courier New, monospace' }}>
            13F INSTITUTIONAL TRACKER
          </div>
        </div>

        {/* Card */}
        <div style={{ background: B.surface, border: `1px solid ${B.border}`, padding: '28px' }}>
          {errorParam && (
            <div style={{ color: B.red, fontSize: '11px', letterSpacing: '1px', marginBottom: '16px', fontFamily: 'Courier New, monospace' }}>
              AUTH ERROR — PLEASE TRY AGAIN
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: B.dim, fontSize: '10px', letterSpacing: '2px', marginBottom: '6px', fontFamily: 'Courier New, monospace' }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  width: '100%', background: '#000', border: `1px solid ${B.border}`,
                  borderBottom: `1px solid ${B.amber}`, color: B.amber,
                  fontFamily: 'Courier New, monospace', fontSize: '13px',
                  padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: B.dim, fontSize: '10px', letterSpacing: '2px', marginBottom: '6px', fontFamily: 'Courier New, monospace' }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{
                  width: '100%', background: '#000', border: `1px solid ${B.border}`,
                  borderBottom: `1px solid ${B.amber}`, color: B.amber,
                  fontFamily: 'Courier New, monospace', fontSize: '13px',
                  padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{ color: error.startsWith('Check') ? B.amber : B.red, fontSize: '11px', letterSpacing: '1px', marginBottom: '16px', fontFamily: 'Courier New, monospace' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', background: loading ? '#333' : B.amber,
                color: loading ? B.dim : '#000', border: 'none',
                fontFamily: 'Courier New, monospace', fontWeight: 'bold',
                fontSize: '12px', letterSpacing: '2px', padding: '10px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'AUTHENTICATING...' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); }}
              style={{ background: 'none', border: 'none', color: B.dim, fontSize: '10px', letterSpacing: '1.5px', cursor: 'pointer', fontFamily: 'Courier New, monospace' }}
            >
              {mode === 'login' ? 'CREATE ACCOUNT' : 'ALREADY HAVE AN ACCOUNT? SIGN IN'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', color: B.dim, fontSize: '9px', letterSpacing: '1.5px', fontFamily: 'Courier New, monospace' }}>
          NOT FINANCIAL ADVICE &nbsp;·&nbsp; ALL TRADING INVOLVES RISK
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
