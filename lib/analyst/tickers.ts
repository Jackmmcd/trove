/**
 * Finding real ticker mentions in prose.
 *
 * Shared by the two chat renderers and the follow-up chips so a fix lands in
 * one place. The naive version — any run of 1–5 capitals that happens to be a
 * known symbol — highlighted the B in "Broadcom", the B in "Both", and the Q in
 * "2026-Q2", and then offered "Who else owns Q?" as a follow-up. Those are all
 * real symbols; the surrounding characters are what make them not mentions.
 */

export interface TickerMatch {
  start: number;
  end: number;
  /** Ticker to link to. */
  symbol: string;
  /** Text as written — "TransDigm" links to TDG but must still read "TransDigm". */
  label: string;
}

// Anchored on both sides: "B" inside "Broadcom" has no trailing boundary, and
// "Q" in "2026-Q2" has no trailing boundary either, so both stop matching.
const CANDIDATE = /\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/g;

/**
 * Single letters are real tickers (F, V, T) but overwhelmingly appear in prose
 * as initials, sentence starts, or list markers. Requiring parentheses — the
 * way a writer actually disambiguates, "Block (XYZ)" — keeps the true cases
 * and drops the noise.
 */
function singleLetterOk(text: string, start: number, end: number): boolean {
  return text[start - 1] === '(' && text[end] === ')';
}

/**
 * Quarter labels are the most common false positive in this app's own output,
 * because every answer cites them: 2026-Q2, Q1, FY24-Q3.
 */
function isQuarterFragment(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 6), start);
  const after = text.slice(end, end + 2);
  return /\d[-–]$/.test(before) || /^\d/.test(after);
}

/** A symbol glued to digits or an adjacent capital run is part of something else. */
function hasAdjacentNoise(text: string, start: number, end: number): boolean {
  return /[0-9]/.test(text[start - 1] ?? '') || /[0-9]/.test(text[end] ?? '');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Company names, not just symbols.
 *
 * The Analyst writes prose — "TransDigm", "GE Aerospace", "Warner Bros
 * Discovery" — so symbol-only matching left most of what it actually named
 * unlinkable. `names` maps a lowercased company name to its ticker; the server
 * drops names claimed by more than one ticker, because linking the wrong
 * company is worse than not linking it.
 */
function findNameMatches(
  text: string,
  names: Record<string, string> | undefined,
  taken: TickerMatch[],
): TickerMatch[] {
  if (!names) return [];
  const lower = text.toLowerCase();
  const out: TickerMatch[] = [];

  // Longest first, so "Warner Bros Discovery" wins over a shorter "Warner".
  const candidates = Object.keys(names)
    .filter(n => lower.includes(n))
    .sort((a, b) => b.length - a.length);

  for (const name of candidates) {
    const re = new RegExp(`\\b${escape(name)}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const overlaps = [...taken, ...out].some(t => start < t.end && end > t.start);
      if (overlaps) continue;
      out.push({ start, end, symbol: names[name], label: text.slice(start, end) });
    }
  }
  return out;
}

export function findTickerMatches(
  text: string,
  known: Set<string>,
  names?: Record<string, string>,
): TickerMatch[] {
  const symbols: TickerMatch[] = [];
  if (known.size) {
    let m: RegExpExecArray | null;
    CANDIDATE.lastIndex = 0;
    while ((m = CANDIDATE.exec(text)) !== null) {
      const symbol = m[0];
      const start = m.index;
      const end = start + symbol.length;
      if (!known.has(symbol)) continue;
      if (isQuarterFragment(text, start, end)) continue;
      if (hasAdjacentNoise(text, start, end)) continue;
      if (symbol.length === 1 && !singleLetterOk(text, start, end)) continue;
      symbols.push({ start, end, symbol, label: symbol });
    }
  }

  const all = [...symbols, ...findNameMatches(text, names, symbols)];
  return all.sort((a, b) => a.start - b.start);
}

/** Distinct symbols in first-mention order. */
export function findTickers(text: string, known: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of findTickerMatches(text, known)) {
    if (seen.has(m.symbol)) continue;
    seen.add(m.symbol);
    out.push(m.symbol);
  }
  return out;
}
