'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'PORTFOLIO' },
    { href: '/funds', label: 'FUNDS' },
    { href: '/rebalance', label: 'REBALANCE' },
    { href: '/recommendations', label: 'SIGNALS' },
    { href: '/news', label: 'NEWS' },
  ];

  return (
    <nav style={{ background: '#000', borderBottom: '1px solid #ff8c00' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '40px', gap: '0' }}>
          {/* Logo */}
          <div style={{
            background: '#ff8c00', color: '#000',
            fontWeight: 'bold', fontSize: '13px',
            padding: '0 12px', height: '40px', display: 'flex', alignItems: 'center',
            marginRight: '16px', letterSpacing: '1px', whiteSpace: 'nowrap'
          }}>
            13F FOLLOWER
          </div>

          {/* Nav links */}
          <div style={{ display: 'flex', gap: '0' }}>
            {links.map(link => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: '0 14px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    letterSpacing: '0.5px',
                    color: active ? '#000' : '#ff8c00',
                    background: active ? '#ff8c00' : 'transparent',
                    borderRight: '1px solid #2a2a2a',
                    textDecoration: 'none',
                    transition: 'none',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side clock/label */}
          <div style={{ marginLeft: 'auto', color: '#555', fontSize: '11px', letterSpacing: '1px' }}>
            13F INSTITUTIONAL TRACKER
          </div>
        </div>
      </div>
    </nav>
  );
}
