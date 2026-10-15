'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes Trove installable and gives it an
 * offline screen. Renders nothing.
 *
 * Only in production: a service worker in front of the dev server caches build
 * assets that change on every edit, which shows up as stale CSS that survives
 * a hard refresh.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // Registering after load keeps the worker off the critical path for the
    // first paint, which is the one the user actually waits for.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error('Service worker registration failed:', err);
      });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
