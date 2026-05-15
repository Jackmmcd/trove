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
    <button disabled style={{ ...btnStyle, background: '#333', color: '#666' }}>LOADING...</button>
  );

  if (isAuthenticated) return (
    <button
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/login');
      }}
      style={{ ...btnStyle, background: 'transparent', color: '#ff3333', border: '1px solid #4a0000' }}>
      LOGOUT
    </button>
  );

  return (
    <button onClick={() => router.push('/login')}
      style={{ ...btnStyle, background: '#ff8c00', color: '#000' }}>
      LOGIN
    </button>
  );
}
