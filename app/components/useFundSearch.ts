'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { searchFunds, type FundMatch } from '@/lib/funds/directory';
import type { FundSearchResult } from '@/lib/funds/embeddings';

/**
 * Fund search in two speeds. Name/manager/strategy matches come from the local
 * directory on every keystroke; matches by what funds actually hold come from
 * /api/fund/search (embeddings) once typing pauses, and only add funds the
 * keyword half didn't already find.
 */
export default function useFundSearch(query: string, limit = 8) {
  const instant: FundMatch[] = useMemo(() => searchFunds(query, limit), [query, limit]);
  const [semantic, setSemantic] = useState<FundSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    setSemantic([]);
    const q = query.trim();
    // A CIK or a two-letter fragment has no meaning to embed.
    if (q.length < 4 || /^\d+$/.test(q)) { setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/fund/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (mine !== seq.current) return;
        const shown = new Set(instant.map(f => f.cik));
        setSemantic(((data.results ?? []) as FundSearchResult[]).filter(r => r.match !== 'name' && !shown.has(r.cik)));
      } catch {
        if (mine === seq.current) setSemantic([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query, instant]);

  return { instant, semantic, loading };
}
