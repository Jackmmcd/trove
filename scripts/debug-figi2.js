const https = require('https');
const axios = require('axios');

const cusips = [
  '02005N100', '02079K305', '023135106', '025816109', '037833100', '047726302',
  '060505104', '14040H105', '16119P108', '166764100', '191216100', '20030N101',
  '21036P108', '22160K105', '235851102', '26138E109', '29355A107', '30231G102',
  '345370860', '38141G104', '38141G736', '413875105', '46625H100', '478160104',
  '48020Q107', '50276E109', '532457108', '55261F104', '57636Q104', '594918104',
  '64110D104', '68389X105', '713448108', '717081103', '80105N105', '87612E106',
  '882184108', '88579Y101', '902494103', '929740108', '92936U109', '94106L109'
];

async function main() {
  const body = cusips.map(cusip => ({ idType: 'ID_CUSIP', idValue: cusip }));
  try {
    const res = await axios.default.post('https://api.openfigi.com/v3/mapping', body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log('Status:', res.status);
    res.data.forEach((r, i) => {
      const ticker = r?.data?.[0]?.ticker;
      console.log(`  ${cusips[i]} → ${ticker ?? 'NOT FOUND: ' + JSON.stringify(r)}`);
    });
  } catch(e) {
    console.error('Error:', e.response?.status, e.response?.data ?? e.message);
  }
}

main();
