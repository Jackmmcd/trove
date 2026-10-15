'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function LoginButton() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user);
      setIsLoading(false);
    });
  }, []);

  const btnStyle: React.CSSProperties = {
    padding: '5px 14px', border: 'none', cursor: 'pointer',
    fontFamily: 'Courier New, monospace', fontWeight: 'bold',
    fontSize: '11px', letterSpacing: '1px',
  };

  if (isLoading) return (
    <button disabled style={{ ...btnStyle, background: 'var(--bg-333333)', color: 'var(--fg-666666)' }}>LOADING...</button>
  );

  if (isAuthenticated) return (
    <button
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/login');
      }}
      style={{ ...btnStyle, background: 'transparent', color: 'var(--fg-ff3333)', border: '1px solid var(--bg-4a0000)' }}>
      LOGOUT
    </button>
  );

  return (
    <button onClick={() => router.push('/login')}
      style={{ ...btnStyle, background: 'var(--bg-ff8c00)', color: 'var(--fg-000000)' }}>
      LOGIN
    </button>
  );
}
