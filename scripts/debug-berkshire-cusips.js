const https = require('https');

const USER_AGENT = '13F Follower App contact@example.com';

function httpsGet(url, asText = false) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (asText) return resolve(data);
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

async function main() {
  const xml = await httpsGet('https://www.sec.gov/Archives/edgar/data/1067983/000119312526054580/50240.xml', true);
  const stripped = xml.replace(/<\/?[a-zA-Z0-9]+:/g, m => m.replace(/[a-zA-Z0-9]+:/, ''));

  const blockRe = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
  const holdings = [];
  let m;
  while ((m = blockRe.exec(stripped)) !== null) {
    const block = m[1];
    const cusip = extractXmlTag(block, 'cusip');
    const name = extractXmlTag(block, 'nameOfIssuer');
    holdings.push({ cusip, name });
  }

  const uniqueCusips = [...new Set(holdings.map(h => h.cusip).filter(Boolean))];
  console.log(`Total blocks: ${holdings.length}`);
  console.log(`Unique CUSIPs: ${uniqueCusips.length}`);
  console.log('Sample CUSIPs:', uniqueCusips.slice(0, 10));
}

main().catch(console.error);
