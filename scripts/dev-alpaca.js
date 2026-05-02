// Loads .env.alpaca then starts Next.js on port 3002.
// Run via: npm run dev:alpaca
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.alpaca') });

const { spawnSync } = require('child_process');
const nextBin = path.join(__dirname, '..', 'node_modules', '.bin', 'next');

const result = spawnSync('node', [nextBin, 'dev', '-p', '3002'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 0);
