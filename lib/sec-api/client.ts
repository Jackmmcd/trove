import axios from 'axios';
import { FundHoldings, Holding } from './types';

const USER_AGENT = process.env.SEC_USER_AGENT || '13F Follower App contact@example.com';

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
   */
  async fetch13FHoldings(cik: string, quarter?: string): Promise<FundHoldings> {
    const normalizedCik = cik.replace(/^0+/, '').padStart(10, '0');
    const filing = await this.getLatest13FFiling(normalizedCik, quarter);

    const rawHoldings = this.parseInfoTableXml(filing.xmlContent);

    // Resolve CUSIPs to tickers via OpenFIGI
    await this.resolveTickers(rawHoldings);

    // Deduplicate by ticker — large filers (e.g. Berkshire) split holdings across
    // multiple investment managers, resulting in duplicate CUSIP entries per filing.
    const tickerMap = new Map<string, Holding>();
    for (const h of rawHoldings) {
      const existing = tickerMap.get(h.ticker);
      if (existing) {
        existing.shares += h.shares;
        existing.value += h.value;
      } else {
        tickerMap.set(h.ticker, { ...h });
      }
    }
    const holdings = Array.from(tickerMap.values());

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    holdings.forEach(h => {
      h.weight = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
    });

    // Sort by value descending
    holdings.sort((a, b) => b.value - a.value);

    return {
      cik: normalizedCik,
      fundName: filing.companyName,
      quarter: this.dateToQuarter(filing.filingDate),
      filingDate: filing.filingDate,
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getLatest13FFiling(cik: string, quarter?: string): Promise<{
    companyName: string;
    filingDate: string;
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
    const primaryDocuments: string[] = recent.primaryDocument ?? [];

    // Find the latest 13F-HR matching the requested quarter
    let targetIdx = -1;
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] !== '13F-HR' && forms[i] !== '13F-HR/A') continue;
      if (quarter && this.dateToQuarter(filingDates[i]) !== quarter) continue;
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
        name: name ?? undefined,
      });
    }

    return holdings;
  }

  private extractXmlTag(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : null;
  }

  /**
   * Batch-resolve CUSIPs to tickers using the OpenFIGI API (free, no key required).
   * https://www.openfigi.com/api
   */
  private async resolveTickers(holdings: Holding[]): Promise<void> {
    const withCusip = holdings.filter(h => h.cusip);
    if (withCusip.length === 0) return;

    const uniqueCusips = [...new Set(withCusip.map(h => h.cusip!))];
    const tickerMap: Record<string, string> = {};

    // OpenFIGI: max 10 items per request without an API key
    const batchSize = 10;
    for (let i = 0; i < uniqueCusips.length; i += batchSize) {
      const batch = uniqueCusips.slice(i, i + batchSize);
      const body = batch.map(cusip => ({ idType: 'ID_CUSIP', idValue: cusip }));

      try {
        const res = await axios.post('https://api.openfigi.com/v3/mapping', body, {
          headers: { 'Content-Type': 'application/json' },
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
        });
      } catch (err: any) {
        console.error('OpenFIGI error:', err?.response?.status, err?.response?.data ?? err?.message);
      }

      // Respect rate limit: 25 req/min without API key → ~2.5s between requests
      if (i + batchSize < uniqueCusips.length) {
        await new Promise(r => setTimeout(r, 2600));
      }
    }

    // Apply resolved tickers; fall back to first word of issuer name
    for (const h of holdings) {
      if (h.cusip && tickerMap[h.cusip]) {
        h.ticker = tickerMap[h.cusip];
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
