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
  const mode = 'login';

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
      // A full navigation rather than router.replace: the session cookie was
      // just written, and only a top-level request re-runs the middleware
      // against it. A client-side transition can race the cookie and, when
      // the account is not on the allowlist, swallows the ?error=restricted
      // the middleware redirects back with — so the sign-in looks like it
      // simply did nothing.
      window.location.assign('/dashboard');
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
    amber: 'var(--bg-ff8c00)',
    bg: 'var(--bg-000000)',
    surface: 'var(--bg-0d0d0d)',
    border: 'var(--bg-1a1a1a)',
    text: 'var(--fg-cccccc)',
    dim: 'var(--fg-666666)',
    red: 'var(--bg-ff3333)',
  };

  return (
    <div style={{ minHeight: '100vh', background: B.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '360px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-block', background: B.amber, color: 'var(--fg-000000)',
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
            <div style={{ color: B.red, fontSize: '11px', letterSpacing: '1px', marginBottom: '16px', fontFamily: 'Courier New, monospace', lineHeight: 1.6 }}>
              {errorParam === 'restricted'
                // Without this the sign-in appears to work and then silently
                // returns here, which reads as a broken login rather than a
                // closed door.
                ? 'THIS ACCOUNT DOES NOT HAVE ACCESS. TROVE IS A PRIVATE DEPLOYMENT.'
                : 'AUTH ERROR — PLEASE TRY AGAIN'}
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
                  width: '100%', background: 'var(--bg-000000)', border: `1px solid ${B.border}`,
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
                  width: '100%', background: 'var(--bg-000000)', border: `1px solid ${B.border}`,
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
                width: '100%', background: loading ? 'var(--bg-333333)' : B.amber,
                color: loading ? B.dim : 'var(--fg-000000)', border: 'none',
                fontFamily: 'Courier New, monospace', fontWeight: 'bold',
                fontSize: '12px', letterSpacing: '2px', padding: '10px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'AUTHENTICATING...' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </button>
          </form>

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
