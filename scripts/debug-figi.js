const https = require('https');

// Test OpenFIGI with Berkshire's known CUSIPs
// Apple = 037833100, BofA = 060505104, Coke = 191216100, Chevron = 166764100
const testCusips = ['037833100', '060505104', '191216100', '166764100', '615369105'];

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let out = '';
      res.on('data', chunk => out += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        try { resolve(JSON.parse(out)); }
        catch { resolve(out); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function main() {
  const body = testCusips.map(cusip => ({ idType: 'ID_CUSIP', idValue: cusip }));
  console.log('Sending to OpenFIGI:', JSON.stringify(body));

  const result = await post('https://api.openfigi.com/v3/mapping', body);
  console.log('\nResult:');
  result.forEach((r, i) => {
    const ticker = r?.data?.[0]?.ticker;
    console.log(`  ${testCusips[i]} → ${ticker ?? ('ERROR: ' + JSON.stringify(r))}`);
  });
}

main().catch(console.error);
