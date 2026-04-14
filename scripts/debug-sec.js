const https = require('https');

const USER_AGENT = '13F Follower App contact@example.com';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const cik = '0001067983';

  console.log('Step 1: Fetching submissions...');
  const subs = await httpsGet(`https://data.sec.gov/submissions/CIK${cik}.json`);
  console.log('Company:', subs.name);

  const recent = subs.filings?.recent;
  const forms = recent?.form ?? [];
  const accNums = recent?.accessionNumber ?? [];
  const dates = recent?.filingDate ?? [];
  const primaryDocs = recent?.primaryDocument ?? [];

  // Find first 13F-HR
  let idx = -1;
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '13F-HR' || forms[i] === '13F-HR/A') { idx = i; break; }
  }

  if (idx === -1) { console.log('No 13F-HR found'); return; }

  const rawAccession = accNums[idx];
  const accessionFlat = rawAccession.replace(/-/g, '');
  const numericCik = parseInt(cik, 10).toString();
  const filingDate = dates[idx];
  const primaryDoc = primaryDocs[idx];

  console.log(`\nStep 2: Found 13F-HR at index ${idx}`);
  console.log('  Filing date:', filingDate);
  console.log('  Accession:', rawAccession);
  console.log('  Flat accession:', accessionFlat);
  console.log('  Numeric CIK:', numericCik);
  console.log('  Primary doc:', primaryDoc);

  const basePath = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionFlat}`;

  console.log('\nStep 3: Fetching filing index...');
  const indexUrl = `${basePath}/${rawAccession}-index.json`;
  console.log('  Index URL:', indexUrl);

  let indexItems = [];
  try {
    const indexData = await httpsGet(indexUrl);
    indexItems = indexData?.directory?.item ?? [];
    console.log('  Index items:', indexItems.length);
    indexItems.forEach(item => console.log('   -', item.name, '|', item.type));
  } catch(e) {
    console.log('  Index fetch failed:', e.message);
  }

  // Find info table doc
  const infoDoc = indexItems.find(item =>
    item.type?.toUpperCase() === 'INFORMATION TABLE' ||
    item.name?.toLowerCase().includes('infotable') ||
    (item.name?.toLowerCase().endsWith('.xml') && item.name?.toLowerCase().includes('info'))
  );
  console.log('\nStep 4: Info doc search:', infoDoc ? infoDoc.name : 'NOT FOUND');

  const docName = infoDoc ? infoDoc.name : primaryDoc;
  const xmlUrl = `${basePath}/${docName}`;
  console.log('\nStep 5: Fetching XML:', xmlUrl);

  const xmlData = await httpsGet(xmlUrl);
  const xml = typeof xmlData === 'string' ? xmlData : JSON.stringify(xmlData);
  console.log('  XML length:', xml.length);
  console.log('  First 500 chars:', xml.substring(0, 500));
  console.log('\n  Has "infoTable":', xml.includes('infoTable'));
  console.log('  Has "InfoTable":', xml.includes('InfoTable'));
  console.log('  Has "nameOfIssuer":', xml.includes('nameOfIssuer'));
  console.log('  Has "n2:infoTable":', xml.includes('n2:infoTable'));

  // Test regex
  const stripped = xml.replace(/<\/?[a-zA-Z0-9]+:/g, m => m.replace(/[a-zA-Z0-9]+:/, ''));
  const blockRe = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
  let count = 0;
  let firstBlock = '';
  let m;
  while ((m = blockRe.exec(stripped)) !== null) {
    if (count === 0) firstBlock = m[1];
    count++;
  }
  console.log('\nStep 6: Parsed', count, 'infoTable blocks');
  if (firstBlock) console.log('  First block:', firstBlock.substring(0, 300));
}

main().catch(console.error);
