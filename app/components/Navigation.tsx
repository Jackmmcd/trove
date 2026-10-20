'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import AISearch from './AISearch';
import ThemeToggle from './ThemeToggle';

interface Suggestion { symbol: string; name: string; type: string; }

const links = [
  { href: '/dashboard', label: 'PORTFOLIO' },
  { href: '/funds', label: 'FUNDS' },
  { href: '/baskets', label: 'BASKETS' },
  { href: '/advisor', label: 'ANALYST' },
];

// The four destinations that earn a permanent slot on a phone; everything
// else lives behind MORE. Icons are drawn rather than imported so the bar
// costs nothing to load.
const tabs = [
  { href: '/dashboard', label: 'PORTFOLIO', icon: 'portfolio' },
  { href: '/funds', label: 'FUNDS', icon: 'funds' },
  { href: '/baskets', label: 'BASKETS', icon: 'baskets' },
  { href: '/advisor', label: 'ANALYST', icon: 'analyst' },
] as const;

function TabIcon({ name }: { name: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'portfolio':
      return <svg viewBox="0 0 20 20" {...common}><path d="M3 15V9M7.6 15V5M12.3 15v-4M17 15V7" /></svg>;
    case 'funds':
      return <svg viewBox="0 0 20 20" {...common}><rect x="2.5" y="4" width="15" height="12" rx="1" /><path d="M2.5 8h15M7.5 8v8" /></svg>;
    case 'baskets':
      return <svg viewBox="0 0 20 20" {...common}><path d="M3 7h14l-1.4 8.2a1 1 0 0 1-1 .8H5.4a1 1 0 0 1-1-.8Z" /><path d="M7 7l2-3.5M13 7l-2-3.5" /></svg>;
    case 'analyst':
      return <svg viewBox="0 0 20 20" {...common}><path d="M17 12.2A1.8 1.8 0 0 1 15.2 14H7l-3.5 3v-3A1.8 1.8 0 0 1 3 12.2V5A1.8 1.8 0 0 1 4.8 3.2h10.4A1.8 1.8 0 0 1 17 5Z" /></svg>;
    case 'more':
      return <svg viewBox="0 0 20 20" {...common}><circle cx="4.5" cy="10" r="1.3" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="10" r="1.3" fill="currentColor" stroke="none" /></svg>;
    default:
      return null;
  }
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
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

  // Close drawer and overlay on route change
  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setAiOpen(false); }, [pathname]);

  const closeAi = useCallback(() => setAiOpen(false), []);

  function openAi() {
    setMenuOpen(false); setSearchOpen(false); setSuggestions([]);
    setAiOpen(true);
  }

  // The drawer and the search overlay both cover the page; stop the page
  // behind them scrolling under the finger.
  useEffect(() => {
    const locked = menuOpen || searchOpen;
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen, searchOpen]);

  // Focus the overlay field once it has actually mounted, so the keyboard
  // comes up with it rather than a tap later.
  useEffect(() => {
    if (searchOpen) overlayInputRef.current?.focus();
  }, [searchOpen]);

  function navigate(ticker: string, path = `/stock/${ticker}`) {
    router.push(path);
    setSearchValue(''); setSuggestions([]); setSearchOpen(false);
    inputRef.current?.blur(); overlayInputRef.current?.blur();
  }

  // Fund suggestions carry the CIK as their symbol and open the fund page.
  function open(s: Suggestion) {
    navigate(s.symbol, s.type === 'fund' ? `/fund/${s.symbol}` : undefined);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) return open(suggestions[activeIndex]);
    // A typed fund name with no ticker match beats opening /stock/BRIDGEWATER.
    const top = suggestions[0];
    if (top?.type === 'fund' && !suggestions.some(s => s.type !== 'fund' && s.symbol === searchValue.trim())) return open(top);
    const ticker = searchValue.trim().toUpperCase();
    if (ticker) navigate(ticker);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setSuggestions([]); setActiveIndex(-1); setSearchOpen(false); return; }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)); }
  }

  const showDropdown = searchFocused && suggestions.length > 0;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const moreActive = !tabs.some(t => t.href === pathname);

  return (
    <div>
      <nav style={{
        background: 'var(--bg-000000)', borderBottom: '1px solid var(--bg-ff8c00)',
        position: 'sticky', top: 0, zIndex: 95,
        paddingTop: 'var(--safe-t)',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '40px', gap: '0' }}>

            {/* Logo */}
            <Link href="/dashboard" style={{
              background: 'var(--bg-ff8c00)', color: 'var(--fg-000000)',
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
                    color: active ? 'var(--fg-000000)' : 'var(--bg-ff8c00)',
                    background: active ? 'var(--bg-ff8c00)' : 'transparent',
                    borderRight: '1px solid var(--bg-2a2a2a)', textDecoration: 'none',
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
                  placeholder="TICKER OR FUND"
                  style={{
                    background: 'transparent', border: 'none',
                    borderBottom: `1px solid ${searchFocused ? 'var(--bg-ff8c00)' : 'var(--bg-666666)'}`,
                    color: 'var(--fg-ffaa33)', fontFamily: 'Courier New, monospace',
                    fontSize: '13px', letterSpacing: '2px', padding: '4px 8px',
                    width: searchFocused || searchValue ? '220px' : '160px',
                    outline: 'none', transition: 'width 0.2s ease, border-color 0.15s ease',
                  }}
                />
              </form>
              {showDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0,
                  background: 'var(--bg-0d0d0d)', border: '1px solid var(--bg-ff8c00)',
                  borderTop: 'none', zIndex: 100, width: '240px',
                }}>
                  {suggestions.map((s, i) => (
                    <div key={s.symbol} onMouseDown={() => open(s)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 12px', cursor: 'pointer',
                      background: i === activeIndex ? 'var(--bg-1a1a00)' : 'transparent',
                      borderBottom: i < suggestions.length - 1 ? '1px solid var(--bg-1a1a1a)' : 'none',
                    }}>
                      <span style={{ color: s.type === 'fund' ? 'var(--bg-00e5ff)' : 'var(--fg-ff8c00)', fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px', fontFamily: 'Courier New, monospace' }}>{s.type === 'fund' ? 'FUND' : s.symbol}</span>
                      <span style={{ color: 'var(--fg-666666)', fontSize: '11px', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: s.type === 'fund' ? '170px' : '140px' }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="nav-search" onClick={openAi} style={{
              marginLeft: '10px', background: 'transparent', border: '1px solid var(--bg-ff8c00)',
              color: 'var(--fg-ff8c00)', fontFamily: 'Courier New, monospace', fontWeight: 'bold',
              fontSize: '10px', letterSpacing: '1px', padding: '3px 10px', height: '24px', cursor: 'pointer',
            }}>
              ✦ AI SEARCH
            </button>

            {/* Right side — desktop */}
            <div className="nav-links" style={{ marginLeft: 'auto', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: 'var(--fg-555555)', fontSize: '11px', letterSpacing: '1px' }}>13F TRACKER</span>
              <ThemeToggle />
              <button onClick={handleLogout} style={{
                background: 'transparent', border: '1px solid var(--bg-2a0000)',
                color: 'var(--fg-cc2222)', fontFamily: 'Courier New, monospace',
                fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px',
                padding: '3px 10px', cursor: 'pointer', height: '24px',
              }}>
                LOGOUT
              </button>
            </div>

            {/* Search — mobile only. Navigation itself lives in the tab bar,
                so the top bar keeps only the one action it can't hold. */}
            <button
              className="nav-mobile-btn"
              style={{ marginLeft: 'auto', width: '40px', justifyContent: 'center' }}
              onClick={() => setSearchOpen(true)}
              aria-label="Search ticker"
            >
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="var(--bg-ff8c00)" strokeWidth="1.9" strokeLinecap="round">
                <circle cx="8.8" cy="8.8" r="5.3" />
                <path d="M12.8 12.8 L17 17" />
              </svg>
            </button>

          </div>
        </div>
      </nav>

      {/* Mobile full-screen search. A phone has no room for an inline field
          that competes with the logo, and the dropdown under one is a
          thumb-sized target — so searching takes over the screen. */}
      {searchOpen && (
        <div className="search-overlay">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: '1px solid var(--bg-ff8c00)' }}>
            <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex' }}>
              <input
                ref={overlayInputRef}
                value={searchValue}
                onChange={e => setSearchValue(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                placeholder="TICKER OR FUND"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                enterKeyHint="search"
                style={{
                  flex: 1, background: 'var(--bg-0a0a0a)', border: '1px solid var(--bg-2a2a2a)',
                  color: 'var(--fg-ffaa33)', fontFamily: 'Courier New, monospace',
                  letterSpacing: '2px', padding: '11px 12px', outline: 'none',
                }}
              />
            </form>
            <button onClick={() => { setSearchOpen(false); setSearchValue(''); setSuggestions([]); }} style={{
              background: 'none', border: 'none', color: 'var(--fg-888888)',
              fontFamily: 'Courier New, monospace', fontSize: '11px',
              letterSpacing: '1px', padding: '0 4px', cursor: 'pointer',
            }}>
              CANCEL
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <button onClick={openAi} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '14px 16px', background: 'var(--bg-0a0a0a)',
              border: 'none', borderBottom: '1px solid var(--bg-1a1a1a)', cursor: 'pointer',
              color: 'var(--fg-ff8c00)', fontFamily: 'Courier New, monospace',
              fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px',
            }}>
              ✦ AI SEARCH <span style={{ color: 'var(--fg-666666)', fontWeight: 'normal', fontSize: '11px' }}>— search by theme or headline</span>
            </button>
            {suggestions.map(s => (
              <button key={s.symbol} onClick={() => open(s)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '12px', width: '100%', textAlign: 'left',
                padding: '14px 16px', background: 'none',
                border: 'none', borderBottom: '1px solid var(--bg-141414)', cursor: 'pointer',
              }}>
                <span style={{ color: s.type === 'fund' ? 'var(--bg-00e5ff)' : 'var(--fg-ff8c00)', fontWeight: 'bold', fontSize: '15px', letterSpacing: '1px', fontFamily: 'Courier New, monospace' }}>{s.type === 'fund' ? 'FUND' : s.symbol}</span>
                <span style={{ color: 'var(--fg-777777)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              </button>
            ))}
            {searchValue.trim() && suggestions.length === 0 && (
              <p style={{ color: 'var(--fg-555555)', fontSize: '12px', letterSpacing: '1px', padding: '20px 16px' }}>
                NO MATCHES — PRESS SEARCH TO OPEN {searchValue.trim()} ANYWAY
              </p>
            )}
          </div>
        </div>
      )}

      {/* Mobile MORE drawer — the destinations that don't get a tab, plus
          account actions. Slides from the bottom, where the thumb is. */}
      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 110 }}
          />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 111,
            background: 'var(--bg-0a0a0a)', borderTop: '1px solid var(--bg-ff8c00)',
            paddingBottom: 'calc(var(--safe-b) + 8px)',
            animation: 'sheet-up .22s cubic-bezier(.2,.8,.3,1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              <div style={{ width: '36px', height: '3px', background: 'var(--bg-333333)', borderRadius: '2px' }} />
            </div>
            {links.filter(l => !tabs.some(t => t.href === l.href)).map(link => {
              const active = pathname === link.href;
              return (
                <Link key={link.href} href={link.href} style={{
                  padding: '15px 20px', fontSize: '14px', fontWeight: 'bold',
                  letterSpacing: '1px', color: active ? 'var(--fg-000000)' : 'var(--bg-ff8c00)',
                  background: active ? 'var(--bg-ff8c00)' : 'transparent',
                  borderTop: '1px solid var(--bg-161616)', textDecoration: 'none',
                  display: 'block',
                }}>
                  {link.label}
                </Link>
              );
            })}
            <button onClick={openAi} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '15px 20px', background: 'transparent',
              border: 'none', borderTop: '1px solid var(--bg-161616)',
              color: 'var(--fg-ff8c00)', fontFamily: 'Courier New, monospace',
              fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px', cursor: 'pointer',
            }}>
              ✦ AI SEARCH
            </button>
            <Link href="/disclosures" style={{
              padding: '15px 20px', fontSize: '13px', letterSpacing: '1px',
              color: 'var(--fg-777777)', borderTop: '1px solid var(--bg-161616)',
              textDecoration: 'none', display: 'block',
            }}>
              DISCLOSURES
            </Link>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bg-161616)' }}>
              <ThemeToggle label style={{ height: '34px', fontSize: '12px', padding: '0 12px' }} />
            </div>
            <button onClick={handleLogout} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '15px 20px', background: 'transparent',
              border: 'none', borderTop: '1px solid var(--bg-161616)',
              color: 'var(--fg-cc2222)', fontFamily: 'Courier New, monospace',
              fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px', cursor: 'pointer',
            }}>
              LOGOUT
            </button>
          </div>
        </>
      )}

      {aiOpen && <AISearch onClose={closeAi} />}

      {/* Mobile tab bar — the primary navigation on a phone. */}
      <nav className="tabbar" aria-label="Primary">
        <div className="tabbar-inner">
          {tabs.map(t => (
            <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : undefined}>
              <TabIcon name={t.icon} />
              <span>{t.label}</span>
            </Link>
          ))}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="More"
            style={{ color: moreActive ? 'var(--fg-ff8c00)' : undefined }}
          >
            <TabIcon name="more" />
            <span>MORE</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
