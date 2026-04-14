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

function extractXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

async function main() {
  const url = 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526054580/50240.xml';
  console.log('Fetching:', url);
  const xml = await httpsGet(url, true);
  console.log('Length:', xml.length);
  console.log('First 800 chars:');
  console.log(xml.substring(0, 800));

  // Test namespace stripping
  const stripped = xml.replace(/<\/?[a-zA-Z0-9]+:/g, m => m.replace(/[a-zA-Z0-9]+:/, ''));
  console.log('\nAfter strip, first 300:', stripped.substring(0, 300));

  const blockRe = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
  let count = 0;
  let firstBlock = '';
  let m;
  while ((m = blockRe.exec(stripped)) !== null) {
    if (count === 0) firstBlock = m[1];
    count++;
  }
  console.log('\nParsed', count, 'infoTable blocks');
  if (firstBlock) {
    console.log('First block:');
    console.log(firstBlock);
    console.log('  nameOfIssuer:', extractXmlTag(firstBlock, 'nameOfIssuer'));
    console.log('  cusip:', extractXmlTag(firstBlock, 'cusip'));
    console.log('  value:', extractXmlTag(firstBlock, 'value'));
    console.log('  sshPrnamt:', extractXmlTag(firstBlock, 'sshPrnamt'));
  }
}

main().catch(console.error);
