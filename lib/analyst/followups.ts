import { findTickers as extractTickers } from './tickers';

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

/** Previous calendar quarter, in the `2025-Q3` form used across the corpus. */
function prevQuarter(year: number, q: number): string {
  return q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`;
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
 * What to ask next about a fund, given what the reply said it did. Evaluated in
 * order, first match wins, so specific beats generic. A table rather than an
 * if/else chain because these are data — reading them as a list is how you
 * notice one is missing.
 */
const FUND_RULES: { when: RegExp; ask: (fund: string) => string }[] = [
  { when: /\bactivist\b/i, ask: f => `What else has ${f} taken an activist position in?` },
  { when: /\bexit(?:ed|s)?\b|\bsold out\b|closed (?:the|its) position|no longer holds/i, ask: f => `What else did ${f} exit?` },
  { when: /\btrimmed\b|\breduced\b|\bcut\b|\bdown \d/i, ask: f => `What else did ${f} trim?` },
  { when: /\bNEW\b|newly opened|\bopened\b|first reported|initiated/i, ask: f => `What else did ${f} open recently?` },
  { when: /concentrat|top-\d|largest (?:holding|position)|% of (?:its|their) book/i, ask: f => `How concentrated is ${f}'s book?` },
];

/** Likewise for the company the reply is about. */
const TICKER_RULES: { when: RegExp; ask: (t: string) => string }[] = [
  { when: /\[debt\]|\bbonds?\b|\bnotes\b|convertible|credit-focused/i, ask: t => `Which funds hold ${t} equity rather than its debt?` },
  { when: /only (?:one|1) fund|single holder|thin support|lonely/i, ask: () => 'Which similar names have broader support?' },
];

// The reply itself says history is missing, so anything time-based is a dead end.
const NO_HISTORY = /no (?:prior|earlier)[\s-]?quarter filing|only one filing|nothing to compare|first (?:filing|disclosure) on record/i;

// The reply declined or found nothing — don't offer chips that just re-ask it.
const CAME_UP_EMPTY = /\bno fund\b|not among those|does not (?:hold|track)|isn't tracked|no tracked fund/i;

// Non-hedge-fund filers are usually why a consensus number is weaker than it looks.
const MIXED_FILERS = /endowment|sovereign|venture|private[\s-]equity|asset manager|treasury/i;

/**
 * Up to three questions the reader plausibly wants next.
 *
 * Driven by what the reply actually says, not just what it names. Two rules
 * matter more than the rest:
 *
 *  - Never offer a question the reply already told us is unanswerable. If it
 *    said a fund has no prior filing, a "how did it change" chip is a dead end
 *    the reader has to click to discover.
 *  - Vary the subject. Three chips about the same fund is one chip.
 */
export function suggestFollowUps(reply: string, known: Set<string>): string[] {
  const text = reply.slice(0, 6000);
  if (text.trim().length < 40) return [];

  const tickers = extractTickers(text, known);
  const funds = findFunds(text, known);
  const ticker = tickers[0];
  const fund = funds[0];

  const noHistory = NO_HISTORY.test(text);
  const cameUpEmpty = CAME_UP_EMPTY.test(text);

  const q = QUARTER_RE.exec(text);
  const period = q
    ? { prev: prevQuarter(Number(q[1] ?? q[4]), Number(q[2] ?? q[3])), cur: `${q[1] ?? q[4]}-Q${q[2] ?? q[3]}` }
    : null;

  const candidates: { chip: string; subject: string }[] = [];
  const push = (chip: string, subject: string) => candidates.push({ chip, subject });

  if (fund) {
    const rule = FUND_RULES.find(r => r.when.test(text));
    push(rule ? rule.ask(fund) : `What else does ${fund} hold?`, fund);
  }

  if (ticker && !cameUpEmpty) {
    const rule = TICKER_RULES.find(r => r.when.test(text));
    push(rule ? rule.ask(ticker) : `Who else owns ${ticker}?`, ticker);
  }

  if (period && !noHistory) {
    const subject = ticker ?? fund;
    if (subject) push(`How did ${subject} change between ${period.prev} and ${period.cur}?`, `time:${subject}`);
  }

  if (tickers[1] && !cameUpEmpty) push(`How do ${ticker} and ${tickers[1]} compare across the funds?`, `pair:${ticker}`);
  if (funds[1]) push(`What do ${fund} and ${funds[1]} both own?`, `pair:${fund}`);
  if (MIXED_FILERS.test(text)) push('Which of these are actual hedge funds rather than other kinds of filer?', 'entity');

  const chips: string[] = [];
  const usedSubjects = new Set<string>();
  for (const c of candidates) {
    if (usedSubjects.has(c.subject)) continue;
    usedSubjects.add(c.subject);
    if (!chips.includes(c.chip)) chips.push(c.chip);
    if (chips.length === 3) return chips;
  }

  // Nothing nameable, or the reply came up empty — offer questions answerable
  // from the tracked filings whatever was asked.
  for (const generic of [
    'Which names are the most funds crowding into?',
    'What were the biggest position changes last quarter?',
    'Which funds does Trove track?',
  ]) {
    if (chips.length === 3) break;
    if (!chips.includes(generic)) chips.push(generic);
  }

  return chips.slice(0, 3);
}
