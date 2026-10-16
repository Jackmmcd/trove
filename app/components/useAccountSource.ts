'use client';

import { useEffect, useState } from 'react';

export type AccountSource = 'unknown' | 'broker' | 'paper';

/**
 * Which account this user is actually operating: the live brokerage, or their
 * own paper account.
 *
 * There is exactly one right answer and only the server can give it — the
 * brokerage credentials are a single set in the environment, so the live
 * account belongs to whoever owns them (see /api/account/source and
 * lib/broker/owner.ts).
 *
 * This existed as three separate guesses. The dashboard asked the server; the
 * funds list and the stock page each inferred it from "did /api/paper/balance
 * return ok?" — which it always does, because that route provisions a paper
 * account on first visit and returns 200 for every signed-in user. So the
 * owner was told they were on paper everywhere except the dashboard, the fund
 * admin controls stayed hidden, and trades placed from those pages went to the
 * simulator instead of the broker.
 *
 * `isPaper` is true until the server positively says 'broker'. That direction
 * matters: guessing "paper" wrongly only simulates a trade, while guessing
 * "broker" wrongly would place a real order against someone else's account.
 */
export default function useAccountSource(): {
  source: AccountSource;
  isPaper: boolean;
  loading: boolean;
} {
  const [source, setSource] = useState<AccountSource>('unknown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/source')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        setSource(data?.source === 'broker' ? 'broker' : 'paper');
      })
      .catch(() => { if (!cancelled) setSource('paper'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { source, isPaper: source !== 'broker', loading };
}
