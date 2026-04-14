'use client';

import { useState, useEffect } from 'react';

export default function LoginButton() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { checkAuthStatus(); }, []);

  async function checkAuthStatus() {
    try {
      const response = await fetch('/api/tastytrade/balance');
      const data = await response.json();
      setIsAuthenticated(response.ok && data.success);
    } catch { setIsAuthenticated(false); } finally { setIsLoading(false); }
  }

  const btnStyle: React.CSSProperties = {
    padding: '5px 14px', border: 'none', cursor: 'pointer',
    fontFamily: 'Courier New, monospace', fontWeight: 'bold',
    fontSize: '11px', letterSpacing: '1px',
  };

  if (isLoading) return (
    <button disabled style={{ ...btnStyle, background: '#333', color: '#666' }}>LOADING...</button>
  );

  if (isAuthenticated) return (
    <button onClick={() => window.location.href = '/api/auth/logout'}
      style={{ ...btnStyle, background: 'transparent', color: '#ff3333', border: '1px solid #4a0000' }}>
      LOGOUT
    </button>
  );

  return (
    <button onClick={() => window.location.href = '/api/auth/login'}
      style={{ ...btnStyle, background: '#ff8c00', color: '#000' }}>
      LOGIN — TASTYTRADE
    </button>
  );
}
