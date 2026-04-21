'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [logoHovered, setLogoHovered] = useState(false);

  const links = [
    { href: '/', label: 'PORTFOLIO' },
    { href: '/funds', label: 'FUNDS' },
    { href: '/recommendations', label: 'SIGNALS' },
    { href: '/news', label: 'NEWS' },
  ];

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <nav style={{ background: '#000', borderBottom: '1px solid #ff8c00' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '40px', gap: '0' }}>
          {/* Logo */}
          <div
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
            style={{
              background: '#ff8c00', color: '#000',
              fontWeight: '900', fontSize: logoHovered ? '20px' : '16px',
              padding: '0 14px', height: '40px', display: 'flex', alignItems: 'center',
              marginRight: '16px', letterSpacing: logoHovered ? '3px' : '2px', whiteSpace: 'nowrap',
              transition: 'font-size 0.15s ease, letter-spacing 0.15s ease',
              cursor: 'default',
            }}
          >
            TROVE
          </div>

          {/* Nav links */}
          <div style={{ display: 'flex', gap: '0' }}>
            {links.map(link => {
              const active = pathname === link.href;
              return (
                <Link key={link.href} href={link.href} style={{
                  padding: '0 14px', height: '40px', display: 'flex', alignItems: 'center',
                  fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px',
                  color: active ? '#000' : '#ff8c00',
                  background: active ? '#ff8c00' : 'transparent',
                  borderRight: '1px solid #2a2a2a', textDecoration: 'none',
                }}>
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#555', fontSize: '11px', letterSpacing: '1px' }}>13F INSTITUTIONAL TRACKER</span>
            <button onClick={logout} style={{
              background: 'none', border: '1px solid #2a2a2a', color: '#555',
              cursor: 'pointer', fontFamily: 'Courier New, monospace', fontSize: '10px',
              letterSpacing: '1px', padding: '3px 10px',
            }}>
              LOGOUT
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
