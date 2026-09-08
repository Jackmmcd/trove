/**
 * Finding real ticker mentions in prose.
 *
 * Shared by the two chat renderers and the follow-up chips so a fix lands in
 * one place. The naive version — any run of 1–5 capitals that happens to be a
 * known symbol — highlighted the B in "Broadcom", the B in "Both", and the Q in
 * "2026-Q2", and then offered "Who else owns Q?" as a follow-up. Those are all
 * real symbols; the surrounding characters are what make them not mentions.
 */

export interface TickerMatch { start: number; end: number; symbol: string }

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

export function findTickerMatches(text: string, known: Set<string>): TickerMatch[] {
  if (!known.size) return [];
  const out: TickerMatch[] = [];
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
    out.push({ start, end, symbol });
  }
  return out;
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
