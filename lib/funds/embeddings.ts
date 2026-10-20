import { db } from '@/lib/supabase/admin';
import { directoryEntry, normalizeCik, searchFunds, FUNDS } from '@/lib/funds/directory';
import { decodeXmlEntities } from '@/lib/sec-api/client';

/**
 * Semantic fund search (supabase-migration-fund-embeddings.sql).
 *
 * Each fund is embedded from what it actually holds — the generated plain-English
 * description of its book plus the issuers of its largest positions — so "funds
 * betting on AI chips" finds the funds whose portfolios say so, not the funds
 * whose directory entry happens to contain the word "tech".
 *
 * Server-only: lib/funds/directory.ts stays importable from the browser.
 */

const TOP_ISSUERS = 15;

const TYPE_LABEL: Record<string, string> = {
  hedge_fund: 'hedge fund', asset_manager: 'asset manager', endowment: 'endowment',
  sovereign_wealth: 'sovereign wealth fund', corporate: 'corporate filer',
};

function clean(s: string): string {
  return decodeXmlEntities(s).replace(/\s+/g, ' ').trim();
}

/**
 * The text a fund is embedded from. The holdings half is what makes this
 * semantic; the directory half (managers, strategy) keeps a fund findable by
 * style even when its holdings don't spell the style out.
 */
export async function fundDocument(cik: string) {
  const entry = directoryEntry(cik);
  const { data: fund } = await db.from('funds')
    .select('id, name, entity_type, filer_note').eq('cik', cik).is('user_id', null).maybeSingle();
  if (!fund) return null;

  const { data: latest } = await db.from('holdings')
    .select('quarter').eq('fund_id', fund.id).is('user_id', null)
    .order('quarter', { ascending: false }).limit(1).maybeSingle();

  const parts = [
    `${entry?.name ?? fund.name} — ${TYPE_LABEL[fund.entity_type] ?? fund.entity_type}.`,
  ];
  if (entry?.aliases.length) parts.push(`Also known as ${entry.aliases.join(', ')}.`);
  if (entry?.tags.length) parts.push(`Strategy: ${entry.tags.join(', ')}.`);
  const note = fund.filer_note || entry?.note;
  if (note) parts.push(note);

  if (!latest) return { cik, source: 'directory' as const, quarter: null, content: clean(parts.join(' ')) };

  const [{ data: top }, { data: thesis }] = await Promise.all([
    db.from('holdings').select('ticker, issuer_name, weight, put_call')
      .eq('fund_id', fund.id).is('user_id', null).eq('quarter', latest.quarter)
      .order('weight', { ascending: false }).limit(TOP_ISSUERS),
    db.from('fund_theses').select('thesis').eq('fund_id', fund.id).maybeSingle(),
  ]);
  if (thesis?.thesis) parts.push(`What it bets on: ${thesis.thesis}`);
  const label = (h: { ticker: string; issuer_name: string | null; weight: number }) => {
    const issuer = h.issuer_name ? clean(h.issuer_name) : h.ticker;
    return `${issuer}${/^[A-Z]{1,5}$/.test(h.ticker) ? ` (${h.ticker})` : ''} ${h.weight.toFixed(1)}%`;
  };
  // Puts listed separately as bets against, so "funds backing Palantir" can't
  // match a fund whose only Palantir position is a put on it.
  const longs = (top ?? []).filter(h => h.put_call !== 'put');
  const puts = (top ?? []).filter(h => h.put_call === 'put');
  if (longs.length) {
    parts.push(`Largest positions: ${longs.map(h => `${label(h)}${h.put_call === 'call' ? ' call options' : ''}`).join(', ')}.`);
  }
  if (puts.length) parts.push(`Betting against (put options): ${puts.map(label).join(', ')}.`);
  return { cik, source: 'holdings' as const, quarter: latest.quarter, content: clean(parts.join(' ')) };
}

/** (Re)embed the given funds. Skips any whose text hasn't changed since last time. */
export async function indexFunds(ciks: string[]): Promise<{ indexed: number; unchanged: number }> {
  const { embed, EMBED_MODEL } = await import('@/lib/voyage/client');
  const docs = (await Promise.all(ciks.map(c => fundDocument(normalizeCik(c))))).filter(d => d !== null);
  if (!docs.length) return { indexed: 0, unchanged: 0 };

  const { data: existing, error } = await db.from('fund_embeddings')
    .select('cik, content, model').in('cik', docs.map(d => d.cik));
  if (error) throw new Error(error.message);
  const same = new Map((existing ?? []).map(e => [e.cik, e]));
  const stale = docs.filter(d => {
    const e = same.get(d.cik);
    return !e || e.content !== d.content || e.model !== EMBED_MODEL;
  });
  if (!stale.length) return { indexed: 0, unchanged: docs.length };

  const vectors = await embed(stale.map(d => d.content), 'document');
  const { error: upErr } = await db.from('fund_embeddings').upsert(
    stale.map((d, i) => ({
      cik: d.cik, source: d.source, quarter: d.quarter, content: d.content,
      embedding: vectors[i], model: EMBED_MODEL, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cik' },
  );
  if (upErr) throw new Error(upErr.message);
  return { indexed: stale.length, unchanged: docs.length - stale.length };
}

export async function indexAllFunds() {
  const { data } = await db.from('funds').select('cik').is('user_id', null).eq('enabled', true);
  const ciks = [...new Set([...(data ?? []).map(f => f.cik), ...FUNDS.map(f => f.cik)])];
  return indexFunds(ciks);
}

export interface FundSearchResult {
  cik: string;
  name: string;
  entity_type: string;
  aliases: string[];
  tags: string[];
  /** 'name' = matched a name, manager or strategy word; 'portfolio' / 'profile' = semantic match on holdings / directory text. */
  match: 'name' | 'portfolio' | 'profile';
  /** Semantic matches only: the largest positions, so the result explains itself. */
  why: string | null;
  score: number;
}

/**
 * Hybrid fund search: exact name/manager matches first (they are what the user
 * meant), then funds whose portfolio is semantically closest to the query.
 * The semantic half is optional — before the migration runs, or if Voyage is
 * unreachable, this is the keyword search and still answers name queries.
 */
export async function hybridFundSearch(query: string, limit = 12): Promise<{ results: FundSearchResult[]; semantic: boolean }> {
  const q = query.trim();
  if (!q) return { results: [], semantic: false };

  const keyword = searchFunds(q, limit);
  // A strong keyword hit is a name lookup ("Citadel", "Dalio"); semantic
  // neighbours of a proper noun are noise, so don't pad the list with them.
  const strongName = keyword.some(k => k.score >= 12);

  const out = new Map<string, FundSearchResult>();
  for (const k of keyword.filter(k => k.score >= (strongName ? 3 : 2))) {
    out.set(k.cik, {
      cik: k.cik, name: k.name, entity_type: k.entity_type, aliases: k.aliases, tags: k.tags,
      match: 'name', why: null, score: k.score,
    });
  }

  let semantic = false;
  if (!strongName && q.length >= 3) {
    try {
      const { embedQuery } = await import('@/lib/voyage/client');
      const { data, error } = await db.rpc('match_funds', {
        query_embedding: await embedQuery(q), match_count: limit, min_similarity: 0.3,
      });
      if (error) throw new Error(error.message);
      semantic = true;
      for (const m of (data ?? []) as { cik: string; source: string; content: string; similarity: number }[]) {
        if (out.has(m.cik)) continue;
        const entry = directoryEntry(m.cik);
        const { data: fund } = entry ? { data: null } : await db.from('funds')
          .select('name, entity_type').eq('cik', m.cik).is('user_id', null).maybeSingle();
        const largest = m.content.match(/Largest positions: (.*?)\.(?: Betting against|$)/)?.[1];
        out.set(m.cik, {
          cik: m.cik,
          name: entry?.name ?? fund?.name ?? m.cik,
          entity_type: entry?.entity_type ?? fund?.entity_type ?? 'hedge_fund',
          aliases: entry?.aliases ?? [], tags: entry?.tags ?? [],
          match: m.source === 'holdings' ? 'portfolio' : 'profile',
          why: largest ? largest.split(', ').slice(0, 4).join(', ') : null,
          score: Number(m.similarity.toFixed(3)),
        });
      }
    } catch {
      // Table not migrated or Voyage down — keyword results stand on their own.
    }
  }

  return { results: [...out.values()].slice(0, limit), semantic };
}
