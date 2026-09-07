/**
 * Follow-up chips derived from the reply text itself.
 *
 * Deliberately no model call: a second round trip to write three questions
 * costs more than the answer they lead to, and the chips have to be on screen
 * the instant streaming stops or the reader has already moved on.
 */

// Legal-ish suffixes a 13F filer's name almost always ends in. Anchoring on the
// suffix keeps this from matching every capitalised phrase in a sentence.
const FUND_SUFFIX =
  '(?:Capital|Management|Partners|Advisors|Advisers|Associates|Investments|Holdings|Research|Securities|Fund|Group)';

// No '.' in the leading words: allowing it lets a match run past a sentence
// boundary and glue the previous sentence's last word onto the fund name.
const FUND_RE = new RegExp(
  `\\b((?:[A-Z][A-Za-z&'’-]+\\s+){1,3}${FUND_SUFFIX}(?:\\s+(?:LP|LLC|Inc))?)\\b`,
  'g',
);

// Filers habitually named without the suffix, so the regex above never sees them.
const BARE_FUNDS = [
  'Berkshire Hathaway', 'Bridgewater', 'Scion', 'Pershing Square', 'Baupost',
  'Duquesne', 'Appaloosa', 'Tiger Global', 'Third Point', 'Elliott',
  'Renaissance Technologies', 'Greenlight', 'Icahn',
];

const QUARTER_RE = /\b(20\d{2})[\s-]?Q([1-4])\b|\bQ([1-4])[\s-](20\d{2})\b/;

const TICKER_RE = /[A-Z]{1,5}(?:\.[A-Z]{1,2})?/g;

/** Previous calendar quarter, in the `2025-Q3` form used across the corpus. */
function prevQuarter(year: number, q: number): string {
  return q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`;
}

function findTickers(text: string, known: Set<string>): string[] {
  if (!known.size) return [];
  const out: string[] = [];
  for (const m of text.matchAll(TICKER_RE)) {
    if (known.has(m[0]) && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

function findFunds(text: string, known: Set<string>): string[] {
  // Kept in order of first mention: the fund the reply leads with is the one
  // the reader is most likely still thinking about.
  const found: { name: string; at: number }[] = [];
  for (const m of text.matchAll(FUND_RE)) {
    // A ticker immediately before a fund name reads as part of it ("…holds TSM.
    // Appaloosa Management…"), so drop leading tokens that are real symbols.
    const words = m[1].trim().split(/\s+/);
    while (words.length > 1 && known.has(words[0])) words.shift();
    const name = words.join(' ');
    if (!found.some(f => f.name === name)) found.push({ name, at: m.index ?? 0 });
  }
  for (const bare of BARE_FUNDS) {
    const at = text.indexOf(bare);
    if (at >= 0 && !found.some(f => f.name.includes(bare))) found.push({ name: bare, at });
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.name);
}

/**
 * Up to three questions the reader plausibly wants next. Ordered so the chips
 * cover different angles — a holder, a fund, a time period — rather than three
 * variations on whichever entity happened to be named first.
 */
export function suggestFollowUps(reply: string, known: Set<string>): string[] {
  const text = reply.slice(0, 6000);
  if (text.trim().length < 40) return [];

  const tickers = findTickers(text, known);
  const funds = findFunds(text, known);
  const q = QUARTER_RE.exec(text);

  const chips: string[] = [];
  if (tickers[0]) chips.push(`Who else owns ${tickers[0]}?`);
  if (funds[0]) chips.push(`What else does ${funds[0]} hold?`);

  if (q) {
    const year = Number(q[1] ?? q[4]);
    const num = Number(q[2] ?? q[3]);
    const subject = tickers[0] ?? funds[0] ?? 'the funds';
    chips.push(`How did ${subject} change between ${prevQuarter(year, num)} and ${year}-Q${num}?`);
  }

  if (tickers[1]) chips.push(`How do ${tickers[0]} and ${tickers[1]} compare across the funds?`);
  if (funds[1]) chips.push(`What do ${funds[0]} and ${funds[1]} both own?`);

  // Nothing nameable in the reply — still offer a way forward, but only
  // questions that are answerable from the corpus no matter what was asked.
  if (chips.length < 2) {
    chips.push('Which names are the most funds crowding into?');
    chips.push('What were the biggest position changes last quarter?');
  }

  return [...new Set(chips)].slice(0, 3);
}
