'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Suggestion { symbol: string; name: string; type: string; }

const links = [
  { href: '/dashboard', label: 'PORTFOLIO' },
  { href: '/funds', label: 'FUNDS' },
  { href: '/baskets', label: 'BASKETS' },
  { href: '/recommendations', label: 'INSIGHTS' },
  { href: '/news', label: 'NEWS' },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(data.results ?? []);
    } catch { setSuggestions([]); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(searchValue), 200);
    setActiveIndex(-1);
  }, [searchValue, fetchSuggestions]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSuggestions([]); setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Close drawer on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  function navigate(ticker: string) {
    router.push(`/stock/${ticker}`);
    setSearchValue(''); setSuggestions([]);
    inputRef.current?.blur();
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const ticker = activeIndex >= 0 && suggestions[activeIndex]
      ? suggestions[activeIndex].symbol
      : searchValue.trim().toUpperCase();
    if (ticker) navigate(ticker);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)); }
    if (e.key === 'Escape') { setSuggestions([]); setActiveIndex(-1); }
  }

  const showDropdown = searchFocused && suggestions.length > 0;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div>
      <nav style={{ background: '#000', borderBottom: '1px solid #ff8c00' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '40px', gap: '0' }}>

            {/* Logo */}
            <Link href="/dashboard" style={{
              background: '#ff8c00', color: '#000',
              fontWeight: '900', fontSize: '16px',
              padding: '0 14px', height: '40px', display: 'flex', alignItems: 'center',
              marginRight: '16px', letterSpacing: '2px', whiteSpace: 'nowrap',
              textDecoration: 'none', flexShrink: 0,
            }}>
              TROVE
            </Link>

            {/* Desktop nav links */}
            <div className="nav-links" style={{ gap: '0' }}>
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

            {/* Desktop search */}
            <div className="nav-search" ref={wrapperRef} style={{ position: 'relative', marginLeft: '8px' }}>
              <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  ref={inputRef}
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value.toUpperCase())}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="SEARCH TICKER"
                  style={{
                    background: 'transparent', border: 'none',
                    borderBottom: `1px solid ${searchFocused ? '#ff8c00' : '#666'}`,
                    color: '#ffaa33', fontFamily: 'Courier New, monospace',
                    fontSize: '13px', letterSpacing: '2px', padding: '4px 8px',
                    width: searchFocused || searchValue ? '220px' : '160px',
                    outline: 'none', transition: 'width 0.2s ease, border-color 0.15s ease',
                  }}
                />
              </form>
              {showDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0,
                  background: '#0d0d0d', border: '1px solid #ff8c00',
                  borderTop: 'none', zIndex: 100, width: '240px',
                }}>
                  {suggestions.map((s, i) => (
                    <div key={s.symbol} onMouseDown={() => navigate(s.symbol)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 12px', cursor: 'pointer',
                      background: i === activeIndex ? '#1a1a00' : 'transparent',
                      borderBottom: i < suggestions.length - 1 ? '1px solid #1a1a1a' : 'none',
                    }}>
                      <span style={{ color: '#ff8c00', fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px', fontFamily: 'Courier New, monospace' }}>{s.symbol}</span>
                      <span style={{ color: '#666', fontSize: '11px', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right side — desktop */}
            <div className="nav-links" style={{ marginLeft: 'auto', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#555', fontSize: '11px', letterSpacing: '1px' }}>13F TRACKER</span>
              <button onClick={handleLogout} style={{
                background: 'transparent', border: '1px solid #2a0000',
                color: '#cc2222', fontFamily: 'Courier New, monospace',
                fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px',
                padding: '3px 10px', cursor: 'pointer', height: '24px',
              }}>
                LOGOUT
              </button>
            </div>

            {/* Hamburger — mobile only */}
            <button
              className="nav-mobile-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <line x1="4" y1="4" x2="16" y2="16" stroke="#ff8c00" strokeWidth="2" strokeLinecap="round" />
                  <line x1="16" y1="4" x2="4" y2="16" stroke="#ff8c00" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <line x1="3" y1="5" x2="17" y2="5" stroke="#ff8c00" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="10" x2="17" y2="10" stroke="#ff8c00" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="15" x2="17" y2="15" stroke="#ff8c00" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>

          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`nav-mobile-drawer${menuOpen ? ' open' : ''}`}>
        {/* Mobile search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #1a1a1a' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              value={searchValue}
              onChange={e => setSearchValue(e.target.value.toUpperCase())}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder="SEARCH TICKER"
              style={{
                flex: 1, background: '#000', border: '1px solid #333',
                borderBottom: '1px solid #ff8c00', color: '#ffaa33',
                fontFamily: 'Courier New, monospace', fontSize: '13px',
                letterSpacing: '2px', padding: '6px 10px', outline: 'none',
              }}
            />
            <button type="submit" style={{
              background: '#ff8c00', color: '#000', border: 'none',
              fontFamily: 'Courier New, monospace', fontWeight: 'bold',
              fontSize: '11px', padding: '6px 12px', cursor: 'pointer',
            }}>GO</button>
          </form>
        </div>

        {/* Mobile nav links */}
        {links.map(link => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              padding: '12px 20px', fontSize: '13px', fontWeight: 'bold',
              letterSpacing: '1px', color: active ? '#000' : '#ff8c00',
              background: active ? '#ff8c00' : 'transparent',
              borderBottom: '1px solid #1a1a1a', textDecoration: 'none',
              display: 'block',
            }}>
              {link.label}
            </Link>
          );
        })}

        <button onClick={handleLogout} style={{
          display: 'block', width: '100%', textAlign: 'left',
          padding: '12px 20px', background: 'transparent',
          border: 'none', borderBottom: '1px solid #1a1a1a',
          color: '#cc2222', fontFamily: 'Courier New, monospace',
          fontWeight: 'bold', fontSize: '12px', letterSpacing: '1px', cursor: 'pointer',
        }}>
          LOGOUT
        </button>
      </div>

      {/* Compliance bar */}
      <div style={{ background: '#0a0a0a', borderBottom: '1px solid #1a1a1a', padding: '4px 16px', textAlign: 'center' }}>
        <span style={{ color: '#444', fontSize: '9px', letterSpacing: '1.5px', fontFamily: 'Courier New, monospace' }}>
          NOT FINANCIAL ADVICE &nbsp;·&nbsp; ALL TRADING INVOLVES RISK OF LOSS &nbsp;·&nbsp; 13F DATA REFLECTS PRIOR QUARTER (45-DAY DELAY) &nbsp;·&nbsp;{' '}
          <a href="/terms" style={{ color: '#555', textDecoration: 'underline' }}>TERMS</a>
          &nbsp;·&nbsp;
          <a href="/privacy" style={{ color: '#555', textDecoration: 'underline' }}>PRIVACY</a>
        </span>
      </div>
    </div>
  );
}
