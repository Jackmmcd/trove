'use client';

import { useEffect, useState } from 'react';

/**
 * True when the viewport is phone-sized (matches the 640px breakpoint the
 * mobile rules in globals.css use).
 *
 * Starts false so server and first client render agree — anything that would
 * flash wrong should be sized in CSS instead. This is for the handful of
 * places that need a real number in JS, chiefly Recharts heights.
 */
export default function useIsMobile(query = '(max-width: 640px)'): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return isMobile;
}
