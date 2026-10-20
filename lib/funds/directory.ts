import directory from '@/config/fund-directory.json';

/**
 * The fund directory — every fund in the global universe with the words people
 * actually use for it. Nobody types "0001350694" or even "Bridgewater
 * Associates, LP"; they type "Dalio", "the Norway oil fund", "quant funds".
 * The database row holds the EDGAR name; this holds everything else.
 *
 * Kept as JSON rather than a table so scripts (plain node) and the app read the
 * same list, and so adding a fund is a reviewed diff rather than a dashboard edit.
 */

export type SyncMode = 'scheduled' | 'on_demand';

export interface DirectoryFund {
  cik: string;
  name: string;
  entity_type: string;
  sync: SyncMode;
  aliases: string[];
  tags: string[];
  note?: string;
}

export const FUNDS: DirectoryFund[] = (directory.funds as DirectoryFund[]);

const BY_CIK = new Map(FUNDS.map(f => [f.cik, f]));

export function normalizeCik(cik: string): string {
  return cik.replace(/\D/g, '').replace(/^0+/, '').padStart(10, '0');
}

export function directoryEntry(cik: string): DirectoryFund | undefined {
  return BY_CIK.get(normalizeCik(cik));
}

/**
 * On-demand funds are fetched when someone looks, never on a schedule. The big
 * filers among them (Citadel, BlackRock, FMR) report thousands of positions in
 * trillions of dollars, so they also stay out of anything that sums dollar value
 * across funds — rebalancing would otherwise just become an index fund.
 */
export function isOnDemand(cik: string): boolean {
  return directoryEntry(cik)?.sync === 'on_demand';
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// Words that carry no signal in a fund query. "capital" and "management" are
// here because nearly every name contains them — matching on them ranks noise.
const STOP = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'by', 'with', 'that', 'is', 'are',
  'who', 'whose', 'what', 'which', 'show', 'me', 'find', 'list', 'all', 'any', 'some', 'run', 'runs',
  'ran', 'managed', 'manages', 'founded', 'started', 'fund', 'funds', 'firm', 'firms', 'manager',
  'managers', 'guy', 'investor', 'investors', 'capital', 'management', 'llc', 'lp', 'inc', 'co',
  'hedge', 'his', 'her', 'their', 'i', 'follow', 'like',
]);

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[’']s\b/g, '')        // "Dalio's" → "dalio"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter(t => t && !STOP.has(t));
}

/** "quants" → "quant", "activists" → "activist"; leaves short words alone. */
function singular(t: string): string {
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t;
}

interface Indexed { fund: DirectoryFund; name: string; aliases: string[]; tags: string[]; words: Set<string> }

const INDEX: Indexed[] = FUNDS.map(f => {
  const name = norm(f.name);
  const aliases = f.aliases.map(norm);
  const tags = [...f.tags.map(norm), norm(f.entity_type.replace(/_/g, ' '))];
  const words = new Set([name, ...aliases, ...tags].join(' ').split(' '));
  return { fund: f, name, aliases, tags, words };
});

function hasWord(field: string, t: string): boolean {
  return ` ${field} `.includes(` ${t} `);
}

export interface FundMatch extends DirectoryFund { score: number }

/**
 * Plain-language fund search: names, managers, nicknames and strategy words.
 * "Ray Dalio's fund" → Bridgewater, "big short guy" → Scion, "tiger cubs" → every
 * tiger cub, "0001067983" → Berkshire. Every query word that matches counts, so
 * "quant macro" ranks a fund tagged both above one tagged either.
 */
export function searchFunds(query: string, limit = 10): FundMatch[] {
  const q = query.trim();
  if (!q) return [];

  const digits = q.replace(/\D/g, '');
  if (digits.length >= 4 && digits.length === q.replace(/\s/g, '').length) {
    const hit = directoryEntry(digits);
    return hit ? [{ ...hit, score: 100 }] : [];
  }

  const phrase = norm(q);
  const ts = tokens(q);
  if (!ts.length && !phrase) return [];

  const scored: FundMatch[] = [];
  for (const ix of INDEX) {
    let score = 0;

    // Whole-phrase hits — "paul tudor jones", "oracle of omaha", "pod shop".
    if (phrase.length >= 3) {
      if (ix.name === phrase || ix.aliases.includes(phrase)) score += 20;
      else if (hasWord(ix.name, phrase) || ix.aliases.some(a => hasWord(a, phrase))) score += 12;
      else if (ix.tags.some(t => t === phrase || hasWord(t, phrase))) score += 8;
    }

    let matched = 0;
    for (const raw of ts) {
      const t = ix.words.has(raw) ? raw : singular(raw);
      let s = 0;
      if (hasWord(ix.name, t)) s = 4;
      else if (ix.aliases.some(a => hasWord(a, t))) s = 3;
      else if (ix.tags.some(tag => hasWord(tag, t))) s = 2;
      else if (t.length >= 3 && [...ix.words].some(w => w.startsWith(t))) s = 1; // typing in progress
      if (s) { matched++; score += s; }
    }
    // A multi-word query should prefer funds that match more of it, so "quant
    // macro" doesn't rank a fund that is merely "macro" level with one that is both.
    if (ts.length > 1) score *= matched / ts.length;

    if (score > 0) scored.push({ ...ix.fund, score: Number(score.toFixed(2)) });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
