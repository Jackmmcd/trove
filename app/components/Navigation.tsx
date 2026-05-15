'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Suggestion {
  symbol: string;
  name: string;
  type: string;
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [logoHovered, setLogoHovered] = useState(false);
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
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(searchValue), 200);
    setActiveIndex(-1);
  }, [searchValue, fetchSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function navigate(ticker: string) {
    router.push(`/stock/${ticker}`);
    setSearchValue('');
    setSuggestions([]);
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

  const links = [
    { href: '/dashboard', label: 'PORTFOLIO' },
    { href: '/funds', label: 'FUNDS' },
    { href: '/baskets', label: 'BASKETS' },
    { href: '/recommendations', label: 'INSIGHTS' },
    { href: '/news', label: 'NEWS' },
  ];

  const showDropdown = searchFocused && suggestions.length > 0;

  return (
    <div>
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

          {/* Ticker search */}
          <div ref={wrapperRef} style={{ position: 'relative', marginLeft: '8px' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={searchValue}
                onChange={e => setSearchValue(e.target.value.toUpperCase())}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={handleKeyDown}
                placeholder="SEARCH TICKER"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${searchFocused ? '#ff8c00' : '#666'}`,
                  color: '#ffaa33',
                  fontFamily: 'Courier New, monospace',
                  fontSize: '13px',
                  letterSpacing: '2px',
                  padding: '4px 8px',
                  width: searchFocused || searchValue ? '260px' : '180px',
                  outline: 'none',
                  transition: 'width 0.2s ease, border-color 0.15s ease',
                }}
              />
            </form>

            {/* Suggestions dropdown */}
            {showDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0,
                background: '#0d0d0d', border: '1px solid #ff8c00',
                borderTop: 'none', zIndex: 100, width: '260px',
              }}>
                {suggestions.map((s, i) => (
                  <div
                    key={s.symbol}
                    onMouseDown={() => navigate(s.symbol)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 12px', cursor: 'pointer',
                      background: i === activeIndex ? '#1a1a00' : 'transparent',
                      borderBottom: i < suggestions.length - 1 ? '1px solid #1a1a1a' : 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a1a00')}
                    onMouseLeave={e => (e.currentTarget.style.background = i === activeIndex ? '#1a1a00' : 'transparent')}
                  >
                    <span style={{ color: '#ff8c00', fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px', fontFamily: 'Courier New, monospace' }}>
                      {s.symbol}
                    </span>
                    <span style={{ color: '#666', fontSize: '11px', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right side */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#555', fontSize: '11px', letterSpacing: '1px' }}>13F INSTITUTIONAL TRACKER</span>
            <button
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                router.push('/login');
              }}
              style={{
                background: 'transparent', border: '1px solid #2a0000',
                color: '#cc2222', fontFamily: 'Courier New, monospace',
                fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px',
                padding: '3px 10px', cursor: 'pointer', height: '24px',
              }}
            >
              LOGOUT
            </button>
          </div>
        </div>
      </div>
    </nav>
    {/* Compliance bar — visible on every authenticated page */}
    <div style={{
      background: '#0a0a0a', borderBottom: '1px solid #1a1a1a',
      padding: '4px 16px', textAlign: 'center',
    }}>
      <span style={{ color: '#444', fontSize: '9px', letterSpacing: '1.5px', fontFamily: 'Courier New, monospace' }}>
        NOT FINANCIAL ADVICE &nbsp;·&nbsp; ALL TRADING INVOLVES RISK OF LOSS &nbsp;·&nbsp; 13F DATA REFLECTS PRIOR QUARTER (45-DAY DELAY) &nbsp;·&nbsp; ORDERS ROUTE THROUGH YOUR CONNECTED BROKER &nbsp;·&nbsp;{' '}
        <a href="/terms" style={{ color: '#555', textDecoration: 'underline' }}>TERMS</a>
        &nbsp;·&nbsp;
        <a href="/privacy" style={{ color: '#555', textDecoration: 'underline' }}>PRIVACY</a>
      </span>
    </div>
    </div>
  );
}
