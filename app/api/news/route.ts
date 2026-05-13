import { NextResponse } from 'next/server';
import axios from 'axios';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/auth/session';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getNews } from '@/lib/polygon/client';

interface NewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  relatedTickers?: string[];
  source: 'yahoo' | 'wsj' | 'reuters' | 'polygon';
}

// ── Yahoo Finance ──────────────────────────────────────────────
async function fetchYahooNews(query: string): Promise<NewsItem[]> {
  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: { q: query, quotesCount: 0, newsCount: 20 },
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 6000,
    });
    return (res.data?.news ?? []).map((n: any) => ({
      uuid: n.uuid,
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      providerPublishTime: n.providerPublishTime,
      relatedTickers: n.relatedTickers ?? [],
      source: 'yahoo' as const,
    }));
  } catch { return []; }
}

// ── RSS parser (simple regex — no extra deps) ─────────────────
function parseRss(xml: string, defaultPublisher: string, source: 'wsj' | 'reuters'): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) ?? [])[1]?.trim();
    const link  = (block.match(/<link[^>]*>([^<]+)<\/link>/) ?? (block.match(/<link[^>]*href="([^"]+)"/) ?? []))[1]?.trim();
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) ?? [])[1]?.trim();
    const publisher = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) ?? [])[1]?.trim() || defaultPublisher;

    if (!title || !link) continue;
    const ts = pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

    items.push({
      uuid: `${source}-${Buffer.from(link).toString('base64').slice(0, 24)}`,
      title: title.replace(/\s*-\s*(WSJ|Reuters)$/, '').trim(),
      publisher,
      link,
      providerPublishTime: ts,
      relatedTickers: [],
      source,
    });
  }
  return items;
}

// ── WSJ RSS (direct feeds — links open in user's browser session) ──
const WSJ_FEEDS = [
  'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
  'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',
  'https://feeds.a.dj.com/rss/RSSOpinion.xml',
];

async function fetchWsjNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    WSJ_FEEDS.map(url =>
      axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml, application/xml' },
        timeout: 8000,
      }).then(r => parseRss(r.data as string, 'WSJ', 'wsj'))
    )
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

// ── Reuters via Google News RSS ────────────────────────────────
const REUTERS_QUERIES = [
  'https://news.google.com/rss/search?q=site:reuters.com+markets&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=site:reuters.com+economy+OR+fed+OR+stocks&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=site:reuters.com+earnings+OR+merger+OR+acquisition&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=site:reuters.com+tariff+OR+trade+OR+inflation&hl=en-US&gl=US&ceid=US:en',
];

async function fetchReutersNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    REUTERS_QUERIES.map(url =>
      axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml, application/xml' },
        timeout: 8000,
      }).then(r => parseRss(r.data as string, 'Reuters', 'reuters'))
    )
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

// ── Main handler ───────────────────────────────────────────────
export async function GET() {
  try {
    // Fetch owned positions and fund holdings in parallel
    const [funds, ownedTickers] = await Promise.all([
      prisma.fund.findMany({
        where: { enabled: true },
        include: { holdings: { orderBy: { weight: 'desc' }, take: 10 } },
      }),
      (async (): Promise<string[]> => {
        try {
          const token = await getValidAccessToken();
          if (!token) return [];
          const client = getTastytradeClient(token);
          const items = await client.getPositions();
          return items
            .filter((p: any) => (p['instrument-type'] || p.instrumentType) === 'Equity')
            .map((p: any) => p.symbol as string);
        } catch { return []; }
      })(),
    ]);

    const fundTickers = [...new Set(funds.flatMap(f => f.holdings.map(h => h.ticker)))].slice(0, 20);
    const ownedSet = new Set(ownedTickers.map(t => t.toUpperCase()));

    // Combine: owned tickers first for query, then fund tickers
    const allQueryTickers = [...new Set([...ownedTickers, ...fundTickers])];
    const macroQueries = [
      'S&P 500 market', 'Federal Reserve interest rates', 'economy inflation',
      'earnings results', 'stock market rally', 'tariffs trade war',
    ];

    // Fetch Polygon news for each ticker (up to 20 tickers, 5 articles each)
    const polygonResults = await Promise.allSettled(
      allQueryTickers.slice(0, 20).map(t => getNews(t, 5))
    );
    const polygonItems: NewsItem[] = polygonResults.flatMap(r =>
      r.status === 'fulfilled' ? r.value.map((n: any) => ({
        uuid: n.id,
        title: n.title,
        publisher: n.publisher?.name ?? '',
        link: n.article_url,
        providerPublishTime: Math.floor(new Date(n.published_utc).getTime() / 1000),
        relatedTickers: n.tickers ?? [],
        source: 'polygon' as const,
      })) : []
    );

    const [macroResults, wsjItems, reutersItems] = await Promise.all([
      Promise.all(macroQueries.map(q => fetchYahooNews(q))),
      fetchWsjNews(),
      fetchReutersNews(),
    ]);

    const allItems: NewsItem[] = [
      ...wsjItems,
      ...reutersItems,
      ...polygonItems,
      ...macroResults.flat(),
    ];

    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const tickerSet = new Set(fundTickers.map(t => t.toUpperCase()));

    const BLOCKED_PUBLISHERS = [
      'motley fool', 'the motley fool', 'benzinga', 'investorplace', 'seeking alpha',
      'mt newswires', 'tmx newsfile', 'globenewswire', 'businesswire', 'pr newswire',
      'accesswire', 'globe newswire', 'newsfile', 'stockstory',
    ];

    // Score: owned tickers = +5, fund tickers = +2, WSJ/Reuters = +3, recency bonus
    function score(n: NewsItem): number {
      let s = 0;
      if (n.source === 'wsj' || n.source === 'reuters') s += 3;
      const titleUp = n.title.toUpperCase();
      const related = (n.relatedTickers ?? []).map(t => t.toUpperCase());
      for (const t of ownedSet) {
        if (titleUp.includes(t) || related.includes(t)) s += 5;
      }
      for (const t of tickerSet) {
        if (!ownedSet.has(t) && (titleUp.includes(t) || related.includes(t))) s += 2;
      }
      const age = now - n.providerPublishTime;
      if (age < 6 * 3600) s += 2;
      else if (age < 12 * 3600) s += 1;
      return s;
    }

    const MACRO_KEYWORDS = ['federal reserve', 'fed ', 'inflation', 'gdp', 'economy', 'recession',
      'interest rate', 's&p', 'dow jones', 'nasdaq', 'market', 'treasury', 'tariff', 'trade war',
      'earnings', 'jobs report', 'unemployment', 'cpi', 'pce', 'fomc', 'yield', 'dollar', 'oil',
      'rally', 'selloff', 'sell-off', 'correction', 'bull', 'bear'];

    // Pass through: WSJ/Reuters, macro-themed articles, or ticker articles matching held/followed tickers.
    function isRelevant(n: NewsItem): boolean {
      if (n.source === 'wsj' || n.source === 'reuters') return true;
      const titleLow = n.title.toLowerCase();
      if (MACRO_KEYWORDS.some(k => titleLow.includes(k))) return true;
      const related = (n.relatedTickers ?? []).map(t => t.toUpperCase());
      const titleUp = n.title.toUpperCase();
      return related.some(t => ownedSet.has(t) || tickerSet.has(t))
        || [...ownedSet, ...tickerSet].some(t => titleUp.includes(t));
    }

    const seen = new Set<string>();
    const deduped = allItems
      .filter(n => {
        if (seen.has(n.uuid)) return false;
        seen.add(n.uuid);
        if (BLOCKED_PUBLISHERS.some(p => n.publisher.toLowerCase().includes(p))) return false;
        if (!isRelevant(n)) return false;
        return n.providerPublishTime >= oneDayAgo;
      });

    // If < 15 articles in last 24h, extend window to 7 days
    const window = deduped.length >= 15 ? deduped : (() => {
      const seenFallback = new Set<string>();
      return allItems.filter(n => {
        if (seenFallback.has(n.uuid)) return false;
        seenFallback.add(n.uuid);
        if (BLOCKED_PUBLISHERS.some(p => n.publisher.toLowerCase().includes(p))) return false;
        if (!isRelevant(n)) return false;
        return n.providerPublishTime >= now - 7 * 86400;
      });
    })();

    const sorted = window
      .sort((a, b) => {
        const scoreDiff = score(b) - score(a);
        return scoreDiff !== 0 ? scoreDiff : b.providerPublishTime - a.providerPublishTime;
      })
      .slice(0, 80);

    return NextResponse.json({ success: true, data: sorted, tickers: fundTickers, ownedTickers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
