const https = require('https');

const USER_AGENT = '13F Follower App contact@example.com';

function httpsGet(url, asText = false) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (asText) { resolve(data); return; }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const accessionFlat = '000119312526054580';
  const numericCik = '1067983';
  const rawAccession = '0001193125-26-054580';
  const basePath = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionFlat}`;

  // Check what the index JSON actually looks like
  console.log('Index JSON raw:');
  const indexRaw = await httpsGet(`${basePath}/${rawAccession}-index.json`, true);
  console.log(indexRaw.substring(0, 1000));

  console.log('\n\n--- Trying index.json (without accession prefix) ---');
  try {
    const indexRaw2 = await httpsGet(`${basePath}/index.json`, true);
    console.log(indexRaw2.substring(0, 2000));
  } catch(e) {
    console.log('Failed:', e.message);
  }
}

main().catch(console.error);
