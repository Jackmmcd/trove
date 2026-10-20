import axios from 'axios';
import { FundHoldings, Holding, InstrumentType } from './types';

/**
 * A CUSIP is 6 issuer characters, 2 issue characters, 1 check digit. The issue
 * half says what kind of security it is: numeric codes are equity (10 is common
 * stock, 88-99 are rights and warrants), alphabetic codes are fixed income.
 *
 * This matters because a 13F can report a company's bonds and its stock as
 * separate line items — EchoStar appears as both 278768106 (common) and
 * 278768AB2 (a 2030 note). Treating those as the same holding overstates
 * conviction; treating them as unrelated companies loses the fact that two
 * funds are both exposed to EchoStar.
 */
export function classifyInstrument(cusip: string | null | undefined): InstrumentType {
  if (!cusip || cusip.length < 8) return 'unknown';
  const issue = cusip.slice(6, 8);
  if (!/^\d{2}$/.test(issue)) return 'debt';
  const n = parseInt(issue, 10);
  return n >= 88 ? 'warrant' : 'equity';
}

const USER_AGENT = process.env.SEC_USER_AGENT || '13F Follower App contact@example.com';

/** "S&amp;P GLOBAL" → "S&P GLOBAL". Issuer names arrive XML-escaped; rows stored before this fix still are. */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// CUSIP → ticker cache (supabase-migration-securities.sql)
// ---------------------------------------------------------------------------
// Imported lazily and failure-tolerant: the cache is an accelerator, so a
// missing table or an environment without Supabase (tests) degrades to plain
// OpenFIGI lookups rather than failing the sync.

const CACHE_CHUNK = 200;

/** cusip → ticker for every CUSIP seen before; null means OpenFIGI had no answer. */
async function readCachedTickers(cusips: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  try {
    const { db } = await import('@/lib/supabase/admin');
    for (let i = 0; i < cusips.length; i += CACHE_CHUNK) {
      const { data, error } = await db.from('securities')
        .select('cusip, ticker, resolved').in('cusip', cusips.slice(i, i + CACHE_CHUNK));
      if (error) throw new Error(error.message);
      for (const r of data ?? []) out.set(r.cusip, r.resolved ? r.ticker : null);
    }
  } catch (e: any) {
    console.warn('securities cache read skipped:', e?.message);
  }
  return out;
}

async function writeCachedTickers(rows: { cusip: string; ticker: string | null }[], holdings: Holding[]) {
  if (!rows.length) return;
  const issuer = new Map(holdings.filter(h => h.cusip).map(h => [h.cusip!, h.name ?? null]));
  try {
    const { db } = await import('@/lib/supabase/admin');
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('securities').upsert(
        rows.slice(i, i + 500).map(r => ({
          cusip: r.cusip, ticker: r.ticker, issuer_name: issuer.get(r.cusip) ?? null,
          resolved: !!r.ticker, updated_at: now,
        })),
        { onConflict: 'cusip' },
      );
      if (error) throw new Error(error.message);
    }
  } catch (e: any) {
    console.warn('securities cache write skipped:', e?.message);
  }
}

const edgarClient = axios.create({
  baseURL: 'https://data.sec.gov',
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
  },
});

const archiveClient = axios.create({
  baseURL: 'https://www.sec.gov',
  headers: {
    'User-Agent': USER_AGENT,
  },
  timeout: 30000,
});

export class SECApiClient {
  /**
   * Fetch 13F holdings for a fund by CIK.
   * @param cik - CIK number (will be zero-padded to 10 digits)
   * @param quarter - Optional "2024-Q1" format; defaults to latest filing
   * @param opts.tickerBudgetMs - Cap on time spent resolving uncached CUSIPs
   */
  async fetch13FHoldings(cik: string, quarter?: string, opts: { tickerBudgetMs?: number } = {}): Promise<FundHoldings> {
    const normalizedCik = cik.replace(/^0+/, '').padStart(10, '0');
    const filing = await this.getLatest13FFiling(normalizedCik, quarter);

    const rawHoldings = this.parseInfoTableXml(filing.xmlContent);

    // Resolve CUSIPs to tickers via OpenFIGI
    await this.resolveTickers(rawHoldings, opts.tickerBudgetMs);

    // Deduplicate — large filers (e.g. Berkshire, Coatue) split holdings across
    // multiple investment managers, producing repeated entries per filing.
    // Key on CUSIP where present: it is the security's real identity, whereas the
    // ticker is a guess from OpenFIGI that may be missing or wrong.
    // The option type is part of the key: shares, calls and puts on one CUSIP
    // are three different positions, and the put points the other way.
    const positionMap = new Map<string, Holding>();
    for (const h of rawHoldings) {
      const key = `${h.cusip ?? `t:${h.ticker}`}|${h.putCall ?? ''}`;
      const existing = positionMap.get(key);
      if (existing) {
        existing.shares += h.shares;
        existing.value += h.value;
      } else {
        positionMap.set(key, { ...h });
      }
    }
    const holdings = Array.from(positionMap.values());

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    holdings.forEach(h => {
      h.weight = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
    });

    // Sort by value descending
    holdings.sort((a, b) => b.value - a.value);

    return {
      cik: normalizedCik,
      fundName: filing.companyName,
      // Quarter comes from the report period, not the filing date. A filing lodged
      // 2026-08-14 covers positions as of 2026-06-30 — labelling that Q3 overstates
      // the data's freshness by a full quarter.
      quarter: this.dateToQuarter(filing.periodEnd),
      filingDate: filing.filingDate,
      periodEnd: filing.periodEnd,
      holdings,
      totalValue,
    };
  }

  /**
   * Validate a CIK and return the company name from EDGAR.
   */
  async lookupCompany(cik: string): Promise<{ name: string; cik: string }> {
    const padded = cik.replace(/^0+/, '').padStart(10, '0');
    const response = await edgarClient.get(`/submissions/CIK${padded}.json`);
    return {
      name: response.data.name as string,
      cik: padded,
    };
  }

  /**
   * The newest 13F on file — one small request, no holdings. Used to decide
   * whether a cached portfolio is still the latest without re-downloading it.
   */
  async latest13F(cik: string): Promise<{ periodEnd: string; filingDate: string } | null> {
    const padded = cik.replace(/^0+/, '').padStart(10, '0');
    const { data } = await edgarClient.get(`/submissions/CIK${padded}.json`, { timeout: 10000 });
    const r = data?.filings?.recent;
    const i = (r?.form ?? []).findIndex((f: string) => f === '13F-HR' || f === '13F-HR/A');
    if (i < 0) return null;
    return { periodEnd: r.reportDate[i] ?? r.filingDate[i], filingDate: r.filingDate[i] };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getLatest13FFiling(cik: string, quarter?: string): Promise<{
    companyName: string;
    filingDate: string;
    periodEnd: string;
    xmlContent: string;
    accessionNumber: string;
  }> {
    // EDGAR submissions endpoint – returns an object with PARALLEL arrays
    const submissionsUrl = `/submissions/CIK${cik}.json`;
    const response = await edgarClient.get(submissionsUrl);
    const data = response.data;

    const recent = data.filings?.recent;
    if (!recent) throw new Error(`No filings data found for CIK ${cik}`);

    const forms: string[] = recent.form ?? [];
    const accessionNumbers: string[] = recent.accessionNumber ?? [];
    const filingDates: string[] = recent.filingDate ?? [];
    const reportDates: string[] = recent.reportDate ?? [];
    const primaryDocuments: string[] = recent.primaryDocument ?? [];

    // Find the latest 13F-HR matching the requested quarter. Match on the report
    // period, so `quarter` means "positions as of", not "paperwork filed in".
    let targetIdx = -1;
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] !== '13F-HR' && forms[i] !== '13F-HR/A') continue;
      if (quarter && this.dateToQuarter(reportDates[i] ?? filingDates[i]) !== quarter) continue;
      targetIdx = i;
      break;
    }

    if (targetIdx === -1) {
      throw new Error(`No 13F-HR filing found for CIK ${cik}${quarter ? ` in ${quarter}` : ''}`);
    }

    const rawAccession = accessionNumbers[targetIdx]; // e.g. "0000950170-25-009432"
    const accessionFlat = rawAccession.replace(/-/g, ''); // "000095017025009432"
    const numericCik = parseInt(cik, 10).toString(); // strip leading zeros for archive path
    const filingDate = filingDates[targetIdx];

    // Fetch the filing index to find the information table document
    const infoTableXml = await this.fetchInfoTableXml(numericCik, accessionFlat, rawAccession, primaryDocuments[targetIdx]);

    return {
      companyName: data.name as string,
      filingDate,
      periodEnd: reportDates[targetIdx] ?? filingDate,
      xmlContent: infoTableXml,
      accessionNumber: rawAccession,
    };
  }

  private async fetchInfoTableXml(
    numericCik: string,
    accessionFlat: string,
    rawAccession: string,
    primaryDocument: string,
  ): Promise<string> {
    const basePath = `/Archives/edgar/data/${numericCik}/${accessionFlat}`;

    // Fetch filing index to find the INFORMATION TABLE document.
    // EDGAR's index.json uses flat filenames (no subdirectory prefix).
    try {
      const indexRes = await archiveClient.get(`${basePath}/index.json`);
      const items: Array<{ name: string; type: string; size?: string }> = indexRes.data?.directory?.item ?? [];

      // The primary cover-page filename without any subdirectory prefix
      const primaryBasename = primaryDocument.split('/').pop() ?? primaryDocument;

      // Find an XML file that isn't the cover page.
      // The information table is typically a numeric filename like "50240.xml".
      const infoDoc = items.find(
        item =>
          item.name?.toLowerCase().endsWith('.xml') &&
          item.name !== primaryBasename &&
          !item.name.toLowerCase().includes('index'),
      );

      if (infoDoc) {
        const xmlRes = await archiveClient.get(`${basePath}/${infoDoc.name}`, {
          headers: { Accept: 'application/xml, text/xml, */*' },
        });
        return xmlRes.data as string;
      }
    } catch {
      // Index fetch failed – fall through to primary document
    }

    // Fall back: strip any subdirectory prefix from the primary document path
    // (submissions JSON sometimes includes an XSL subdirectory that doesn't exist in the archive)
    const fallbackBasename = primaryDocument.split('/').pop() ?? primaryDocument;
    const xmlRes = await archiveClient.get(`${basePath}/${fallbackBasename}`, {
      headers: { Accept: 'application/xml, text/xml, */*' },
    });
    return xmlRes.data as string;
  }

  /**
   * Parse 13F information table XML using regex.
   * The XML contains <infoTable> blocks with nameOfIssuer, cusip, value, sshPrnamt.
   * Since SEC 13F modernization (Q4 2023), `value` is reported in full USD (not thousands).
   */
  private parseInfoTableXml(xml: string): Holding[] {
    if (typeof xml !== 'string' || xml.trim() === '') return [];

    const holdings: Holding[] = [];
    // Strip XML namespaces from tag names so regex works regardless of namespace prefix
    const stripped = xml.replace(/<\/?[a-zA-Z0-9]+:/g, m => m.replace(/[a-zA-Z0-9]+:/, ''));

    const blockRe = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRe.exec(stripped)) !== null) {
      const block = match[1];

      const name = this.extractXmlTag(block, 'nameOfIssuer');
      const cusip = this.extractXmlTag(block, 'cusip');
      const rawValue = this.extractXmlTag(block, 'value');
      const rawShares = this.extractXmlTag(block, 'sshPrnamt');
      // <putCall> marks an option line. Ignoring it is how Scion's Palantir
      // PUT — a $912M bet against the stock — was shown as 66% long Palantir.
      const putCall = this.extractXmlTag(block, 'putCall')?.toLowerCase();

      if (!rawValue) continue;

      // SEC 13F modernization (effective 2023 Q4): values reported in full dollars, not thousands
      const value = parseFloat(rawValue);
      const shares = rawShares ? parseFloat(rawShares) : 0;

      holdings.push({
        ticker: cusip ?? name?.split(' ')[0].toUpperCase() ?? 'UNKNOWN',
        shares,
        value,
        weight: 0,
        cusip: cusip ?? undefined,
        cusip6: cusip ? cusip.slice(0, 6) : undefined,
        instrumentType: classifyInstrument(cusip),
        name: name ?? undefined,
        putCall: putCall === 'put' || putCall === 'call' ? putCall : undefined,
      });
    }

    return holdings;
  }

  private extractXmlTag(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
    const m = xml.match(re);
    return m ? decodeXmlEntities(m[1].trim()) : null;
  }

  /**
   * Batch-resolve CUSIPs to tickers using the OpenFIGI API (free, no key required).
   * https://www.openfigi.com/api
   *
   * Resolutions are cached in the `securities` table, so a CUSIP is looked up
   * once ever rather than once per fund per quarter — most of a new filer's book
   * is names some other fund already holds.
   *
   * `budgetMs` bounds the OpenFIGI phase. Without a key the API takes 10 CUSIPs
   * per 2.6s, so Citadel's ~8,000-line book would take most of an hour. Lookups
   * run largest position first; whatever the budget doesn't reach keeps its CUSIP
   * as the ticker (displayed by issuer name) rather than the issuer-name guess,
   * because the guess collides — every iShares fund becomes "ISHARES".
   */
  private async resolveTickers(holdings: Holding[], budgetMs = Infinity): Promise<void> {
    const withCusip = holdings.filter(h => h.cusip);
    if (withCusip.length === 0) return;

    // Largest positions first, so a budget cut-off only costs the tail.
    const byValue = [...withCusip].sort((a, b) => b.value - a.value);
    const uniqueCusips = [...new Set(byValue.map(h => h.cusip!))];
    const cached = await readCachedTickers(uniqueCusips);
    const tickerMap: Record<string, string> = {};
    for (const [cusip, ticker] of cached) if (ticker) tickerMap[cusip] = ticker;
    const misses = uniqueCusips.filter(c => !cached.has(c));
    const missSet = new Set(misses);

    // OpenFIGI: 10 jobs/request and 25 requests/min anonymously; with a key,
    // 100 jobs/request and 250 requests/min.
    const apiKey = process.env.OPENFIGI_API_KEY;
    const batchSize = apiKey ? 100 : 10;
    const pause = apiKey ? 250 : 2600;
    const deadline = Date.now() + budgetMs;
    const attempted = new Set<string>();
    const fresh: { cusip: string; ticker: string | null }[] = [];

    for (let i = 0; i < misses.length; i += batchSize) {
      if (Date.now() > deadline) break;
      const batch = misses.slice(i, i + batchSize);
      const body = batch.map(cusip => ({ idType: 'ID_CUSIP', idValue: cusip }));

      try {
        const res = await axios.post('https://api.openfigi.com/v3/mapping', body, {
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-OPENFIGI-APIKEY': apiKey } : {}) },
          timeout: 15000,
        });

        (res.data as any[]).forEach((result, idx) => {
          const items: any[] = result?.data ?? [];
          // Prefer a US-listed common stock; fall back to first result
          const us = items.find(
            (d: any) =>
              d.marketSector === 'Equity' &&
              (d.exchCode === 'US' || d.exchCode === 'UN' || d.exchCode === 'UQ'),
          );
          const ticker = (us ?? items[0])?.ticker;
          if (ticker) tickerMap[batch[idx]] = ticker;
          attempted.add(batch[idx]);
          fresh.push({ cusip: batch[idx], ticker: ticker ?? null });
        });
      } catch (err: any) {
        console.error('OpenFIGI error:', err?.response?.status, err?.response?.data ?? err?.message);
      }

      if (i + batchSize < misses.length) {
        await new Promise(r => setTimeout(r, pause));
      }
    }

    await writeCachedTickers(fresh, holdings);

    // Apply resolved tickers. A CUSIP OpenFIGI actually answered "unknown" for
    // falls back to the first word of the issuer name, as it always has; one the
    // budget never reached keeps the CUSIP.
    for (const h of holdings) {
      if (h.cusip && tickerMap[h.cusip]) {
        h.ticker = tickerMap[h.cusip];
      } else if (h.cusip && missSet.has(h.cusip) && !attempted.has(h.cusip)) {
        h.ticker = h.cusip;
      } else if (h.name) {
        h.ticker = h.name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6) || 'UNKNOWN';
      }
    }
  }

  private dateToQuarter(dateString: string): string {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    if (month <= 3) return `${year}-Q1`;
    if (month <= 6) return `${year}-Q2`;
    if (month <= 9) return `${year}-Q3`;
    return `${year}-Q4`;
  }
}

let clientInstance: SECApiClient | null = null;

export function getSECApiClient(): SECApiClient {
  if (!clientInstance) clientInstance = new SECApiClient();
  return clientInstance;
}
