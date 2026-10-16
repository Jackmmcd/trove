'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_KEY } from '@/lib/theme';

/**
 * The phone app, running on a laptop.
 *
 * DevTools device emulation gets the layout right but not the product: it
 * cannot make `navigator.standalone` true, so the boot script picks the
 * website's dark default and you never see the light theme the installed app
 * actually opens in. This frames the real app in an iframe at true device
 * dimensions and drives the theme directly, which is the thing worth
 * demoing.
 *
 * The iframe is same-origin, so it shares localStorage — writing the theme
 * key here is exactly what the in-app toggle does, and the frame picks it up
 * on its next load.
 */

const DEVICES = [
  // safeTop / safeBottom are the real inset values iOS reports for each
  // device. A browser iframe has no notch, so env(safe-area-inset-*) resolves
  // to 0 and the app draws its nav underneath the island. Injecting these
  // reproduces what the phone actually does.
  { id: 'se', label: 'iPhone SE', w: 375, h: 667, radius: 0, island: false, safeTop: 20, safeBottom: 0 },
  { id: '15', label: 'iPhone 15', w: 393, h: 852, radius: 54, island: true, safeTop: 59, safeBottom: 34 },
  { id: 'max', label: 'iPhone 15 Pro Max', w: 430, h: 932, radius: 58, island: true, safeTop: 59, safeBottom: 34 },
] as const;

const ROUTES = [
  { path: '/dashboard', label: 'Portfolio' },
  { path: '/funds', label: 'Funds' },
  { path: '/baskets', label: 'Baskets' },
  { path: '/advisor', label: 'Analyst' },
  { path: '/login', label: 'Login' },
];

type Theme = 'light' | 'dark';

export default function DemoPage() {
  const [deviceId, setDeviceId] = useState<(typeof DEVICES)[number]['id']>('15');
  const [theme, setThemeState] = useState<Theme>('light');
  const [route, setRoute] = useState('/dashboard');
  const [landscape, setLandscape] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [fit, setFit] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const device = useMemo(
    () => DEVICES.find(d => d.id === deviceId) ?? DEVICES[1],
    [deviceId],
  );
  const w = landscape ? device.h : device.w;
  const h = landscape ? device.w : device.h;

  // Write the theme the frame will read on its next load. Same origin, same
  // key the in-app toggle uses.
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
    setNonce(n => n + 1);
  }, [theme]);

  // Scale the whole phone down to fit the window rather than letting a 932px
  // device run off the bottom of a laptop screen. The iframe still lays out at
  // full logical size, so the app's own media queries are untouched.
  useEffect(() => {
    const recompute = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const pad = 48;
      const available = stage.clientHeight - pad;
      setFit(Math.min(1, available / (h + 24)));
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [h]);

  /**
   * Give the framed app the insets the device would report. Same-origin, so
   * this reaches the frame's document directly. --tabbar-h is rebuilt rather
   * than inherited because globals.css derives it from env() straight rather
   * than from --safe-b.
   */
  function applyInsets() {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const top = landscape ? 0 : device.safeTop;
    const bottom = landscape ? 21 : device.safeBottom;
    const root = doc.documentElement;
    root.style.setProperty('--safe-t', `${top}px`);
    root.style.setProperty('--safe-b', `${bottom}px`);
    root.style.setProperty('--safe-l', '0px');
    root.style.setProperty('--safe-r', '0px');
    if (doc.defaultView && doc.defaultView.innerWidth <= 640) {
      root.style.setProperty('--tabbar-h', `calc(54px + ${bottom}px)`);
    }
  }

  const src = `${route}${route.includes('?') ? '&' : '?'}_demo=${nonce}`;

  const chrome = {
    bg: '#15161a',
    panel: '#1e1f25',
    border: '#2e3038',
    text: '#e7e7ea',
    dim: '#9a9ba3',
    accent: '#ff8c00',
  };

  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? chrome.accent : 'transparent',
    color: active ? '#000' : chrome.dim,
    border: `1px solid ${active ? chrome.accent : chrome.border}`,
    borderRadius: 6,
    padding: '6px 11px',
    font: '600 12px/1 ui-sans-serif, system-ui, sans-serif',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: chrome.bg, color: chrome.text,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    }}>
      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        padding: '12px 18px', borderBottom: `1px solid ${chrome.border}`,
        background: chrome.panel, flexShrink: 0,
      }}>
        <div style={{ font: '700 13px/1 ui-sans-serif, system-ui, sans-serif', letterSpacing: 1 }}>
          <span style={{ color: chrome.accent }}>TROVE</span>{' '}
          <span style={{ color: chrome.dim, fontWeight: 500 }}>mobile preview</span>
        </div>

        <Group label="Device">
          {DEVICES.map(d => (
            <button key={d.id} style={btn(d.id === deviceId)} onClick={() => setDeviceId(d.id)}>
              {d.label}
            </button>
          ))}
        </Group>

        <Group label="Theme">
          <button style={btn(theme === 'light')} onClick={() => setThemeState('light')}>
            Light (installed app)
          </button>
          <button style={btn(theme === 'dark')} onClick={() => setThemeState('dark')}>
            Dark (website)
          </button>
        </Group>

        <Group label="Screen">
          {ROUTES.map(r => (
            <button key={r.path} style={btn(r.path === route)} onClick={() => setRoute(r.path)}>
              {r.label}
            </button>
          ))}
        </Group>

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button style={btn(landscape)} onClick={() => setLandscape(v => !v)}>⟲ Rotate</button>
          <button style={btn(false)} onClick={() => setNonce(n => n + 1)}>↻ Reload</button>
        </div>
      </div>

      {/* Stage */}
      <div ref={stageRef} style={{
        flex: 1, minHeight: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        // A subtle grid so the phone reads as a device on a surface rather
        // than a floating rectangle.
        backgroundImage:
          'radial-gradient(circle at 1px 1px, #24262c 1px, transparent 0)',
        backgroundSize: '22px 22px',
      }}>
        <div style={{ transform: `scale(${fit})`, transformOrigin: 'center center' }}>
          <div style={{
            position: 'relative',
            width: w + 24, height: h + 24,
            background: 'linear-gradient(160deg, #3a3d45, #1b1d22)',
            borderRadius: device.radius ? device.radius + 12 : 22,
            padding: 12,
            boxShadow: '0 30px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06) inset',
          }}>
            <div style={{
              position: 'relative', width: w, height: h,
              borderRadius: device.radius || 6,
              overflow: 'hidden', background: '#000',
            }}>
              <iframe
                ref={frameRef}
                key={`${deviceId}-${landscape}-${nonce}`}
                src={src}
                title="Trove on iPhone"
                onLoad={applyInsets}
                style={{ width: w, height: h, border: 'none', display: 'block' }}
              />
              {device.island && !landscape && (
                <>
                  <div style={{
                    position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
                    width: 112, height: 31, borderRadius: 18, background: '#000',
                    pointerEvents: 'none',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: 9, left: '50%', transform: 'translateX(-50%)',
                    width: 138, height: 5, borderRadius: 3, background: 'currentColor',
                    opacity: .32, pointerEvents: 'none',
                  }} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        padding: '8px 18px', borderTop: `1px solid ${chrome.border}`,
        background: chrome.panel, color: chrome.dim, fontSize: 11, flexShrink: 0,
      }}>
        {w} × {h} CSS px{fit < 1 ? ` · shown at ${Math.round(fit * 100)}%` : ''} ·
        {' '}The frame runs the real app, so anything you do here is real.
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: '#71737c' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}
