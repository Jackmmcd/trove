'use client';

import { useSyncExternalStore } from 'react';
import { THEME_KEY as KEY } from '@/lib/theme';

export type Theme = 'dark' | 'light';
const EVENT = 'trove-theme-change';

function read(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

const noop = () => () => {};

export function setTheme(t: Theme) {
  if (t === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(KEY, t); } catch { /* private mode: still applies for this visit */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Current theme, re-rendering when it changes. Dark on the server. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'dark');
}

/**
 * Resolve a `var(--…)` colour to the hex it currently stands for — for canvas
 * libraries, which cannot read CSS variables themselves.
 */
export function resolveColor(value: string): string {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  if (!m || typeof document === 'undefined') return value;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || value;
}

export default function ThemeToggle({ style, label = false }: { style?: React.CSSProperties; label?: boolean }) {
  const theme = useTheme();
  // The server cannot know the stored choice; render the icon after mount so
  // hydration does not mismatch.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const next: Theme = theme === 'light' ? 'dark' : 'light';

  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      style={{
        background: 'transparent', border: '1px solid var(--bg-2a2a2a)',
        color: 'var(--bg-ff8c00)', fontFamily: 'Courier New, monospace',
        fontWeight: 'bold', fontSize: '10px', letterSpacing: '1px',
        height: '24px', minWidth: '28px', padding: '0 8px', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        ...style,
      }}
    >
      {mounted && (
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          {next === 'light'
            ? <><circle cx="10" cy="10" r="3.6" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></>
            : <path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" />}
        </svg>
      )}
      {label && <span>{mounted ? (next === 'light' ? 'LIGHT MODE' : 'DARK MODE') : 'THEME'}</span>}
    </button>
  );
}
