import { NextResponse } from 'next/server';
import axios from 'axios';

const USER_AGENT = process.env.SEC_USER_AGENT || '13F Follower App contact@example.com';

const edgarClient = axios.create({
  baseURL: 'https://data.sec.gov',
  headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
});

const archiveClient = axios.create({
  baseURL: 'https://www.sec.gov',
  headers: { 'User-Agent': USER_AGENT },
  timeout: 30000,
});

/** GET /api/sec/debug?cik=1067983 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cik = searchParams.get('cik') ?? '1067983';
  const normalizedCik = cik.replace(/^0+/, '').padStart(10, '0');

  const steps: any[] = [];

  try {
    // Step 1: Get submissions
    const subRes = await edgarClient.get(`/submissions/CIK${normalizedCik}.json`);
    const data = subRes.data;
    steps.push({ step: 'submissions', name: data.name });

    const recent = data.filings?.recent;
    const forms: string[] = recent?.form ?? [];
    const accessionNumbers: string[] = recent?.accessionNumber ?? [];
    const filingDates: string[] = recent?.filingDate ?? [];
    const primaryDocuments: string[] = recent?.primaryDocument ?? [];

    // Step 2: Find first 13F-HR
    let targetIdx = -1;
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === '13F-HR' || forms[i] === '13F-HR/A') { targetIdx = i; break; }
    }
    if (targetIdx === -1) {
      return NextResponse.json({ error: 'No 13F-HR found', steps });
    }

    const rawAccession = accessionNumbers[targetIdx];
    const accessionFlat = rawAccession.replace(/-/g, '');
    const numericCik = parseInt(normalizedCik, 10).toString();
    const basePath = `/Archives/edgar/data/${numericCik}/${accessionFlat}`;

    steps.push({
      step: 'filing_found',
      form: forms[targetIdx],
      filingDate: filingDates[targetIdx],
      rawAccession,
      accessionFlat,
      numericCik,
      primaryDocument: primaryDocuments[targetIdx],
      basePath,
    });

    // Step 3: Fetch filing index
    const indexUrl = `${basePath}/${rawAccession}-index.json`;
    steps.push({ step: 'fetching_index', url: indexUrl });

    let indexItems: any[] = [];
    try {
      const indexRes = await archiveClient.get(indexUrl);
      indexItems = indexRes.data?.directory?.item ?? [];
      steps.push({ step: 'index_items', count: indexItems.length, items: indexItems });
    } catch (e: any) {
      steps.push({ step: 'index_error', error: e.message });
    }

    // Step 4: Find info table document
    const infoDoc = indexItems.find(
      (item: any) =>
        item.type?.toUpperCase() === 'INFORMATION TABLE' ||
        item.name?.toLowerCase().includes('infotable') ||
        (item.name?.toLowerCase().endsWith('.xml') && item.name?.toLowerCase().includes('info')),
    );
    steps.push({ step: 'info_doc_search', found: !!infoDoc, infoDoc });

    // Step 5: Fetch the XML (info table or primary doc)
    const docName = infoDoc ? infoDoc.name : primaryDocuments[targetIdx];
    const xmlUrl = `${basePath}/${docName}`;
    steps.push({ step: 'fetching_xml', url: xmlUrl, docName });

    const xmlRes = await archiveClient.get(xmlUrl, {
      headers: { Accept: 'application/xml, text/xml, */*' },
    });
    const xmlRaw = xmlRes.data as string;
    const xmlSnippet = typeof xmlRaw === 'string' ? xmlRaw.substring(0, 2000) : JSON.stringify(xmlRaw).substring(0, 2000);
    steps.push({ step: 'xml_fetched', length: typeof xmlRaw === 'string' ? xmlRaw.length : 'not a string', snippet: xmlSnippet });

    // Step 6: Test regex parse
    if (typeof xmlRaw === 'string') {
      const stripped = xmlRaw.replace(/<\/?[a-zA-Z0-9]+:/g, (m: string) => m.replace(/[a-zA-Z0-9]+:/, ''));
      const blockRe = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
      let count = 0;
      let firstBlock = '';
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(stripped)) !== null) {
        if (count === 0) firstBlock = m[1];
        count++;
      }
      steps.push({ step: 'parse_result', infoTableCount: count, firstBlockSnippet: firstBlock.substring(0, 500) });

      // Also check for alternative tag names
      const hasInfoTable = xmlRaw.includes('infoTable') || xmlRaw.includes('InfoTable') || xmlRaw.includes('infotable');
      const hasNameOfIssuer = xmlRaw.includes('nameOfIssuer') || xmlRaw.includes('nameofissuer');
      steps.push({ step: 'tag_check', hasInfoTable, hasNameOfIssuer, xmlType: typeof xmlRaw });
    }

    return NextResponse.json({ success: true, steps });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, steps });
  }
}
