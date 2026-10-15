import Anthropic from '@anthropic-ai/sdk';
import { searchSecurities } from '@/lib/advisor/tools';
import { recordUsage } from '@/lib/advisor/usage';

/**
 * AI Search: a theme, sector trend, or headline in; a short read on what it
 * means for markets and which held companies it touches out.
 *
 * The symbols are never the model's own picks. The semantic index over what
 * each tracked company does supplies the candidates, and the model may only
 * keep or discard them — so every row links to a name a tracked fund holds,
 * and nothing invented reaches the table.
 *
 * Two model calls, because a headline does not look like a business
 * description: "Trump and Xi agree on AI talks" scores under 0.3 against every
 * company in the index, while "semiconductor equipment sold to China" scores
 * 0.5 against AMAT and ASML. A cheap first call turns the query into the kinds
 * of businesses it affects; those phrases are what get searched.
 */

const EXPAND_SYSTEM = `Turn the user's market theme, investment idea, or news headline into 3–4 short search phrases, each describing a KIND OF BUSINESS whose results it would materially affect — what the company makes or sells, not the event. Example: "Trump and Xi agree on AI talks" → "semiconductor equipment makers selling to China", "AI accelerator chip designers", "cloud and data centre operators", "rare earth and critical mineral suppliers". Each phrase 3–9 words.`;

const EXPAND_TOOL: Anthropic.Tool = {
  name: 'search_phrases',
  description: 'Return the business-description search phrases.',
  input_schema: {
    type: 'object',
    properties: { phrases: { type: 'array', items: { type: 'string' } } },
    required: ['phrases'],
  },
};

const SYSTEM = `You are a sharp equity analyst. The user describes a market theme, sector trend, investment idea, or news headline. You are given CANDIDATE companies from a search over what each company does; every candidate is held by at least one institutional fund the app tracks.

Produce:
- title: a 2–6 word headline naming the theme, e.g. "US–China AI Dialogue Reset".
- insights: exactly 5 bullets, each under 15 words, plain English. Each is a cause → effect statement about the market consequences. The last bullet states what has to hold true for the thesis to work.
- symbols: the candidates that genuinely fit, most direct exposure first, at most 8. For each, one sentence under 20 words saying why this theme touches its business specifically.

Rules:
- Only use tickers from the candidate list. Never add a company that is not listed.
- Drop candidates that merely resemble the theme. If none fit, return an empty symbols list.
- If the query is a headline you cannot verify, reason about it as a hypothetical; do not claim it happened.
- No price targets, no buy/sell language.`;

const RESULT_TOOL: Anthropic.Tool = {
  name: 'quick_insights',
  description: 'Return the quick insight for the user\'s query.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      insights: { type: 'array', items: { type: 'string' } },
      symbols: {
        type: 'array',
        items: {
          type: 'object',
          properties: { symbol: { type: 'string' }, reason: { type: 'string' } },
          required: ['symbol', 'reason'],
        },
      },
    },
    required: ['title', 'insights', 'symbols'],
  },
};

export interface AiSearchResult {
  query: string;
  title: string;
  insights: string[];
  symbols: { symbol: string; name: string | null; reason: string; held_by_funds: number }[];
}

interface Candidate { ticker: string; name: string | null; business: string; held_by_funds: number; match_strength: number }

function toolInput<T>(msg: Anthropic.Message): T {
  const block = msg.content.find(b => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('No result returned');
  return block.input as T;
}

async function expandQuery(client: Anthropic, q: string): Promise<string[]> {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: EXPAND_SYSTEM,
      tools: [EXPAND_TOOL],
      tool_choice: { type: 'tool', name: EXPAND_TOOL.name },
      messages: [{ role: 'user', content: q }],
    });
    void recordUsage(msg.usage);
    const { phrases } = toolInput<{ phrases?: string[] }>(msg);
    return (phrases ?? []).map(p => p.trim()).filter(Boolean).slice(0, 4);
  } catch {
    // The raw query still works for queries already phrased as a theme.
    return [];
  }
}

/** Search each phrase, keep each company's best match, strongest first. */
async function findCandidates(phrases: string[]): Promise<Candidate[]> {
  const found = await Promise.all(phrases.map(p => searchSecurities(p, 10)));
  const best = new Map<string, Candidate>();
  for (const r of found) {
    if (!('results' in r) || !Array.isArray(r.results)) continue;
    for (const c of r.results as Candidate[]) {
      const cur = best.get(c.ticker);
      if (!cur || c.match_strength > cur.match_strength) best.set(c.ticker, c);
    }
  }
  return [...best.values()].sort((a, b) => b.match_strength - a.match_strength).slice(0, 30);
}

export async function runAiSearch(q: string, apiKey: string): Promise<AiSearchResult> {
  const client = new Anthropic({ apiKey });

  const phrases = await expandQuery(client, q);
  const candidates = await findCandidates([q, ...phrases]);
  const byTicker = new Map(candidates.map(c => [c.ticker, c]));
  const list = candidates.length
    ? candidates.map(c => `${c.ticker} — ${c.name ?? c.ticker}: ${c.business}`).join('\n')
    : '(none — the search found no held company close to this query)';

  const msg = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1200,
    system: SYSTEM,
    tools: [RESULT_TOOL],
    tool_choice: { type: 'tool', name: RESULT_TOOL.name },
    messages: [{ role: 'user', content: `Query: ${q}\n\nCandidates:\n${list}` }],
  });
  void recordUsage(msg.usage);

  const out = toolInput<{ title?: string; insights?: string[]; symbols?: { symbol: string; reason: string }[] }>(msg);

  // Hold the model to the candidate list even if it strays.
  const seen = new Set<string>();
  const symbols = (out.symbols ?? [])
    .map(s => ({ ...s, symbol: s.symbol?.toUpperCase().trim() }))
    .filter(s => byTicker.has(s.symbol) && !seen.has(s.symbol) && seen.add(s.symbol))
    .slice(0, 8)
    .map(s => {
      const c = byTicker.get(s.symbol)!;
      return { symbol: s.symbol, name: c.name, reason: s.reason, held_by_funds: c.held_by_funds };
    });

  return { query: q, title: out.title ?? q, insights: (out.insights ?? []).slice(0, 6), symbols };
}
