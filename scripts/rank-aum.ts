#!/usr/bin/env node
/**
 * Usage: npx tsx scripts/rank-aum.ts <path-to-tsv> [> output.csv]
 *
 * Reads an OTHERMANAGER2-style TSV, deduplicates managers by name, then looks
 * up regulatory AUM for each using the SEC's free monthly IA firm bulk CSV
 * (Form ADV Item 5F(2)(c) = Total Regulatory AUM).  Managers not found in
 * the IA data fall back to their 13F portfolio total as a lower-bound proxy.
 *
 * Data source:
 *   https://www.sec.gov/data-research/sec-markets-data/
 *     information-about-registered-investment-advisers-exempt-reporting-advisers
 */

import * as fs from 'fs';
import { execFileSync } from 'child_process';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawRow {
  accessionNumber: string;
  crd: string;
  cik: string;
  secFileNumber: string;
  name: string;
}

interface UniqueManager {
  name: string;
  normalizedName: string;
  crd: string;
  cik: string;
  secFileNumber: string;
}

interface IaRecord {
  name: string;
  aum: number;
}

type AumSource = 'ADV-CRD' | 'ADV-name' | '13F-proxy' | 'none';

interface RankedManager extends UniqueManager {
  aum: number | null;
  aumSource: AumSource;
  iaName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = '13F Follower research contact@example.com';
const SEC_DELAY_MS = 200; // ~5 req/sec, under the 10 req/sec limit

const IA_PAGE_URL =
  'https://www.sec.gov/data-research/sec-markets-data/' +
  'information-about-registered-investment-advisers-exempt-reporting-advisers';

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// 1. Parse TSV
// ---------------------------------------------------------------------------

function parseTsv(filePath: string): RawRow[] {
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  const header = lines[0].split('\t').map(h => h.trim().toUpperCase());

  const col = (name: string) => header.findIndex(h => h.includes(name));
  const iAcc = col('ACCESSION');
  const iCrd = col('CRDNUMBER');
  const iCik = col('CIK');
  const iSec = col('SECFILENUMBER');
  const iName = col('NAME');

  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 2) continue;
    const name = (cols[iName] ?? '').trim();
    if (!name) continue;
    rows.push({
      accessionNumber: (cols[iAcc] ?? '').trim(),
      crd: (cols[iCrd] ?? '').trim(),
      cik: (cols[iCik] ?? '').trim(),
      secFileNumber: (cols[iSec] ?? '').trim(),
      name,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 2. Deduplicate by normalised name, keeping the best identifiers
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingZeros(s: string): string {
  return s.replace(/^0+/, '') || '0';
}

function deduplicateManagers(rows: RawRow[]): UniqueManager[] {
  const map = new Map<string, UniqueManager>();
  for (const row of rows) {
    const key = normalizeName(row.name);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { name: row.name, normalizedName: key, crd: row.crd, cik: row.cik, secFileNumber: row.secFileNumber });
    } else {
      if (!existing.crd && row.crd) existing.crd = row.crd;
      if (!existing.cik && row.cik) existing.cik = row.cik;
      if (!existing.secFileNumber && row.secFileNumber) existing.secFileNumber = row.secFileNumber;
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// 3. Download & parse the SEC IA bulk CSV
//    Returns two Maps: CRD→IaRecord and normalisedName→IaRecord
// ---------------------------------------------------------------------------

async function findLatestIaZipUrl(): Promise<string> {
  process.stderr.write('Fetching latest IA data URL from SEC...\n');
  const res = await axios.get<string>(IA_PAGE_URL, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
  });
  // Match first non-exempt .zip link (most recent registered IA file)
  const match = res.data.match(/href="(\/files\/[^"]+\/ia\d+\.zip)"/i);
  if (match) {
    const url = `https://www.sec.gov${match[1]}`;
    process.stderr.write(`Latest IA data: ${url}\n`);
    return url;
  }
  throw new Error('Could not find latest IA ZIP URL on SEC page — check ' + IA_PAGE_URL);
}

async function loadIaData(): Promise<{ crdMap: Map<string, IaRecord>; nameMap: Map<string, IaRecord> }> {
  const zipUrl = await findLatestIaZipUrl();

  process.stderr.write('Downloading IA bulk data (~5 MB)...\n');
  const res = await axios.get<ArrayBuffer>(zipUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': USER_AGENT },
    timeout: 120000,
  });
  const zipBuf = Buffer.from(res.data);
  process.stderr.write(`Downloaded ${(zipBuf.length / 1_000_000).toFixed(1)} MB\n`);

  // Extract ZIP + parse CSV using Python (avoids adding a ZIP npm dep)
  const pyScript = `
import zipfile, csv, io, json, sys
buf = sys.stdin.buffer.read()
result = {}
with zipfile.ZipFile(io.BytesIO(buf)) as z:
    fname = z.namelist()[0]
    with z.open(fname) as f:
        content = f.read().decode('utf-8-sig', errors='replace')
        for row in csv.DictReader(io.StringIO(content)):
            crd = row.get('Organization CRD#', '').strip().lstrip('0') or '0'
            name = row.get('Primary Business Name', '').strip()
            aum_str = row.get('5F(2)(c)', '').strip()
            if aum_str and aum_str not in ('0', '0.00', ''):
                try:
                    aum = float(aum_str.replace(',', ''))
                    if aum > 0:
                        result[crd] = {'name': name, 'aum': aum}
                except:
                    pass
print(json.dumps(result))
`;

  process.stderr.write('Parsing CSV via Python...\n');
  const jsonOut = execFileSync('python3', ['-c', pyScript], {
    input: zipBuf,
    maxBuffer: 200 * 1024 * 1024,
  });

  const raw: Record<string, { name: string; aum: number }> = JSON.parse(jsonOut.toString());

  const crdMap = new Map<string, IaRecord>();
  const nameMap = new Map<string, IaRecord>();

  for (const [crd, rec] of Object.entries(raw)) {
    crdMap.set(crd, rec);
    const normKey = normalizeName(rec.name);
    if (!nameMap.has(normKey)) nameMap.set(normKey, rec);
  }

  process.stderr.write(`Loaded ${crdMap.size} IA firms from bulk data\n\n`);
  return { crdMap, nameMap };
}

// ---------------------------------------------------------------------------
// 4. 13F portfolio total as lower-bound proxy (no OpenFIGI, sums raw values)
// ---------------------------------------------------------------------------

async function fetch13FProxy(cik: string): Promise<number | null> {
  const padded = stripLeadingZeros(cik).padStart(10, '0');
  try {
    const subRes = await axios.get(
      `https://data.sec.gov/submissions/CIK${padded}.json`,
      { headers: { 'User-Agent': USER_AGENT }, timeout: 20000 },
    );
    await delay(SEC_DELAY_MS);

    const recent = subRes.data?.filings?.recent;
    if (!recent) return null;

    const forms: string[] = recent.form ?? [];
    const accessions: string[] = recent.accessionNumber ?? [];
    const primaryDocs: string[] = recent.primaryDocument ?? [];

    let idx = -1;
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === '13F-HR' || forms[i] === '13F-HR/A') { idx = i; break; }
    }
    if (idx === -1) return null;

    const flat = accessions[idx].replace(/-/g, '');
    const numericCik = stripLeadingZeros(cik);
    const basePath = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${flat}`;

    // Find InfoTable XML
    const indexRes = await axios.get(`${basePath}/index.json`, {
      headers: { 'User-Agent': USER_AGENT }, timeout: 20000,
    });
    await delay(SEC_DELAY_MS);

    const items: Array<{ name: string }> = indexRes.data?.directory?.item ?? [];
    const primaryBasename = (primaryDocs[idx] ?? '').split('/').pop() ?? '';
    const infoDoc = items.find(item =>
      item.name?.toLowerCase().endsWith('.xml') &&
      item.name !== primaryBasename &&
      !item.name.toLowerCase().includes('index'),
    );
    if (!infoDoc) return null;

    const xmlRes = await axios.get(`${basePath}/${infoDoc.name}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, */*' },
      timeout: 30000,
    });
    await delay(SEC_DELAY_MS);

    const xml: string = typeof xmlRes.data === 'string' ? xmlRes.data : '';
    if (!xml) return null;

    // Sum all <value> elements (post-2023 Q4: full USD)
    const stripped = xml.replace(/<\/?[a-zA-Z0-9]+:/g, m => m.replace(/[a-zA-Z0-9]+:/, ''));
    let total = 0;
    const re = /<value[^>]*>([\d.]+)<\/value>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) total += parseFloat(m[1]);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. Lookup AUM for a single manager
// ---------------------------------------------------------------------------

async function lookupAum(
  manager: UniqueManager,
  crdMap: Map<string, IaRecord>,
  nameMap: Map<string, IaRecord>,
): Promise<{ aum: number | null; source: AumSource; iaName?: string }> {
  // Step 1: CRD exact match in IA bulk data
  if (manager.crd) {
    const numeric = stripLeadingZeros(manager.crd);
    const rec = crdMap.get(numeric);
    if (rec) return { aum: rec.aum, source: 'ADV-CRD', iaName: rec.name };
  }

  // Step 2: Normalised name match in IA bulk data
  const rec = nameMap.get(manager.normalizedName);
  if (rec) return { aum: rec.aum, source: 'ADV-name', iaName: rec.name };

  // Step 3: 13F portfolio total proxy
  if (manager.cik) {
    const aum = await fetch13FProxy(manager.cik);
    if (aum !== null) return { aum, source: '13F-proxy' };
  }

  return { aum: null, source: 'none' };
}

// ---------------------------------------------------------------------------
// 6. Format & output
// ---------------------------------------------------------------------------

function formatAum(aum: number | null): string {
  if (aum === null) return '';
  if (aum >= 1e12) return `$${(aum / 1e12).toFixed(2)}T`;
  if (aum >= 1e9) return `$${(aum / 1e9).toFixed(1)}B`;
  if (aum >= 1e6) return `$${(aum / 1e6).toFixed(0)}M`;
  return `$${aum.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tsvPath = process.argv[2];
  if (!tsvPath) {
    console.error('Usage: npx tsx scripts/rank-aum.ts <path-to-tsv>');
    process.exit(1);
  }

  // Parse & deduplicate input
  process.stderr.write(`Parsing TSV: ${tsvPath}\n`);
  const rows = parseTsv(tsvPath);
  const unique = deduplicateManagers(rows);
  process.stderr.write(`${rows.length} rows → ${unique.length} unique managers\n\n`);

  // Load IA bulk data once
  const { crdMap, nameMap } = await loadIaData();

  // Look up each manager
  const results: RankedManager[] = [];
  for (let i = 0; i < unique.length; i++) {
    const m = unique[i];
    process.stderr.write(`[${i + 1}/${unique.length}] ${m.name} ... `);
    const { aum, source, iaName } = await lookupAum(m, crdMap, nameMap);
    process.stderr.write(`${aum !== null ? formatAum(aum) : 'no data'} [${source}]\n`);
    results.push({ ...m, aum, aumSource: source, iaName });
  }

  // Sort: known AUM descending, unknowns at bottom
  results.sort((a, b) => {
    if (a.aum === null && b.aum === null) return 0;
    if (a.aum === null) return 1;
    if (b.aum === null) return -1;
    return b.aum - a.aum;
  });

  // Output CSV
  console.log('rank,name,aum_formatted,aum_usd,source,ia_matched_name,crd,cik');
  let rank = 0;
  for (const m of results) {
    if (m.aum !== null) rank++;
    const name = `"${m.name.replace(/"/g, '""')}"`;
    const iaName = m.iaName ? `"${m.iaName.replace(/"/g, '""')}"` : '';
    console.log(
      `${m.aum !== null ? rank : ''},${name},${formatAum(m.aum)},${m.aum ?? ''},${m.aumSource},${iaName},${m.crd},${m.cik}`,
    );
  }

  const withAum = results.filter(r => r.aum !== null).length;
  process.stderr.write(`\nDone. ${withAum}/${results.length} managers have AUM data.\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
