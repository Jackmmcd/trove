'use client';

import { useEffect, useState } from 'react';

/**
 * How much of the bottom of the window the on-screen keyboard is covering, in
 * CSS pixels. Zero when no keyboard is up.
 *
 * iOS does not shrink the layout viewport when the keyboard opens, so a
 * `position: fixed; bottom: 0` element stays pinned behind the keyboard.
 * Safari papers over that by scrolling the whole page upward, which is why
 * focusing the composer drags the entire interface with it.
 *
 * The visual viewport does shrink, so the gap between the two is the
 * keyboard's height — and anything anchored to the bottom can be lifted by
 * exactly that much and stay put instead.
 */
export default function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // offsetTop is how far the visual viewport has itself been scrolled
      // within the layout viewport; without it the inset is overstated while
      // the page is mid-scroll and the composer jumps.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // The URL bar collapsing also moves these numbers by a few dozen pixels.
      // Only a change big enough to be a keyboard counts.
      setInset(covered > 120 ? Math.round(covered) : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
